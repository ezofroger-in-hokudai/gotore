import type { Exercise, TrainingSession } from "@/lib/api";
import {
  type SavedQueue,
  applyQueueChange,
  queueChange,
  queuedExercises,
  readQueue,
  writeQueue,
} from "./queue-storage";
import { createSessionId } from "./session-id";
export type QueueState = {
  session: TrainingSession | null;
  pending: number;
  status: "idle" | "syncing" | "offline" | "conflict";
  error: string;
  ready: boolean;
  confirmedRevision: number;
  saved: TrainingSession | null;
  finishPending: boolean;
  finishRecord: TrainingSession | null;
};
type Options = {
  read: () => string | null;
  write: (value: string | null) => void;
  lock: <T>(name: string, work: () => Promise<T>) => Promise<T>;
  load: () => Promise<TrainingSession | null>;
  send: (id: string, revision: number, exercises: Exercise[]) => Promise<TrainingSession>;
  finish: (id: string, revision: number) => Promise<TrainingSession>;
};

// 表示用の記録と確定済みrevisionを分け、送信中にも次の操作を永続化する。
export class SessionQueue {
  state: QueueState = {
    session: null,
    pending: 0,
    status: "idle",
    error: "",
    ready: false,
    confirmedRevision: 0,
    saved: null,
    finishPending: false,
    finishRecord: null,
  };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private stopped = false;
  constructor(private options: Options) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  stop() {
    this.stopped = true;
  }
  start() {
    this.stopped = false;
  }
  private read(): SavedQueue | null {
    const raw = this.options.read();
    if (!raw) return null;
    return readQueue(raw);
  }
  private publish(record: SavedQueue | null, patch: Partial<QueueState> = {}) {
    const draft = record && {
      ...record.base,
      exercises: queuedExercises(record),
      revision: record.base.revision + record.pending.length,
    };
    this.state = {
      ...this.state,
      session: draft && !record.finish ? draft : null,
      finishRecord: draft && record.finish ? draft : null,
      pending: record?.pending.length ?? 0,
      finishPending: !!record?.finish,
      confirmedRevision: record?.base.revision ?? 0,
      ...patch,
      ...(record?.conflict ? { status: "conflict" as const } : {}),
    };
    for (const listener of this.listeners) listener();
  }
  private write(record: SavedQueue | null, patch: Partial<QueueState> = {}) {
    // 書き込み失敗時はUIにも追加しない。ACK後に失敗しても同じ要求を再送できる。
    try {
      this.options.write(record ? writeQueue(record) : null);
    } catch {
      throw new Error("この端末に記録を保存できません。空き容量やブラウザ設定を確認してください。");
    }
    this.publish(record, patch);
  }
  async restore() {
    try {
      const record = this.read();
      if (record) this.publish(record, { ready: true });
      if (!record?.pending.length && !record?.finish) await this.refresh();
    } catch (reason) {
      this.fail(reason);
    }
  }
  private fail(reason: unknown) {
    this.state = {
      ...this.state,
      status: "offline",
      error: reason instanceof Error ? reason.message : "同期できませんでした。",
    };
    for (const listener of this.listeners) listener();
  }
  async refresh() {
    await this.options.lock("send", async () => {
      if (this.read()?.pending.length || this.read()?.finish) return;
      const server = await this.options.load();
      await this.options.lock("store", async () => {
        if (this.read()?.pending.length || this.read()?.finish) return;
        this.write(server ? { base: server, pending: [] } : null, {
          ready: true,
          status: "idle",
          error: "",
        });
      });
    });
  }
  async accept(session: TrainingSession | null) {
    await this.options.lock("store", async () => {
      if (this.read()?.pending.length || this.read()?.finish)
        throw new Error("記録の送信が進行中です。");
      this.write(session?.ended_at ? null : session ? { base: session, pending: [] } : null, {
        ready: true,
        status: "idle",
        error: "",
      });
    });
  }
  async enqueue(exercises: Exercise[], revision: number) {
    return this.options.lock("store", async () => {
      const record = this.read();
      if (!record || record.conflict || record.finish)
        throw new Error("保存済みとの違いを確認してください。端末の入力は保持しています。");
      const current = {
        ...record.base,
        exercises: queuedExercises(record),
        revision: record.base.revision + record.pending.length,
      };
      if (revision !== current.revision)
        throw new Error("別の保存があります。セットを選び直してください。");
      if (JSON.stringify(exercises) === JSON.stringify(current.exercises)) return current;
      const next = {
        ...record,
        pending: [
          ...record.pending,
          { id: createSessionId(), change: queueChange(current.exercises, exercises) },
        ],
      };
      this.write(next);
      return this.state.session as TrainingSession;
    });
  }
  async requestFinish(onCommitted?: () => void) {
    return this.options.lock("store", async () => {
      const record = this.read();
      if (!record || record.conflict) throw new Error("終了する記録を確認できません。");
      if (!record.finish) {
        const next = { ...record, finish: true };
        try {
          this.options.write(writeQueue(next));
        } catch {
          throw new Error(
            "この端末に記録を保存できません。空き容量やブラウザ設定を確認してください。",
          );
        }
        try {
          onCommitted?.();
        } finally {
          this.publish(next);
        }
      } else {
        onCommitted?.();
      }
      return {
        ...record.base,
        exercises: queuedExercises(record),
        revision: record.base.revision + record.pending.length,
      };
    });
  }
  sync() {
    if (this.running) return this.running;
    this.running = this.options
      .lock("send", async () => {
        while (!this.stopped) {
          const record = this.read();
          const job = record?.pending[0];
          if (!record || record.conflict || (!job && !record.finish)) {
            this.publish(record);
            return;
          }
          this.publish(record, { status: "syncing", error: "" });
          try {
            if (!job) {
              const result = await this.options.finish(record.base.id, record.base.revision);
              if (
                result.id !== record.base.id ||
                result.revision !== record.base.revision + 1 ||
                !result.ended_at ||
                JSON.stringify(result.exercises) !== JSON.stringify(record.base.exercises)
              )
                throw Object.assign(new Error("終了結果の確認が必要です。"), { status: 409 });
              await this.options.lock("store", async () => {
                const latest = this.read();
                if (
                  latest?.base.id !== record.base.id ||
                  latest.base.revision !== record.base.revision ||
                  latest.pending.length ||
                  !latest.finish
                )
                  return;
                this.write(null, { status: "idle", error: "", saved: result });
              });
              continue;
            }
            const exercises = applyQueueChange(record.base.exercises, job.change);
            const result = await this.options.send(record.base.id, record.base.revision, exercises);
            // 後続差分の基準は送信した全状態。異なるACKへ差分を適用しない。
            if (
              result.id !== record.base.id ||
              result.revision !== record.base.revision + 1 ||
              JSON.stringify(result.exercises) !== JSON.stringify(exercises)
            )
              throw Object.assign(new Error("保存結果の確認が必要です。"), { status: 409 });
            await this.options.lock("store", async () => {
              const latest = this.read();
              if (latest?.base.id !== record.base.id || latest.pending[0]?.id !== job.id) return;
              this.write(
                {
                  base: result,
                  pending: latest.pending.slice(1),
                  ...(latest.finish ? { finish: true } : {}),
                },
                { status: "idle", error: "", saved: result },
              );
            });
          } catch (reason) {
            await this.options.lock("store", async () => {
              const latest = this.read();
              const conflict =
                !!reason &&
                typeof reason === "object" &&
                "status" in reason &&
                [403, 404, 409, 422].includes(Number(reason.status));
              if (latest && conflict)
                this.write(
                  { ...latest, conflict: true },
                  {
                    error: "別の更新があります。未送信の記録を確認してください。",
                    status: "conflict",
                  },
                );
              else
                this.publish(latest, {
                  status: "offline",
                  error: "未送信の記録は端末に保持しています。接続後に再送します。",
                });
            });
            return;
          }
        }
      })
      .catch((reason) => this.fail(reason))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }
  async discardAfterConfirmation() {
    await this.options.lock("send", async () => {
      const server = await this.options.load();
      await this.options.lock("store", async () => {
        this.write(server ? { base: server, pending: [] } : null, {
          ready: true,
          status: "idle",
          error: "",
        });
      });
    });
  }
}
