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
  send: (
    id: string,
    revision: number,
    exercises: Exercise[],
    activityAt?: string,
  ) => Promise<TrainingSession>;
  reconcile: (id: string, occurredAt: string) => Promise<TrainingSession>;
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
  private rerunRequested = false;
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
      session: draft && !record.finish && !record.base.ended_at ? draft : null,
      finishRecord: draft && (record.finish || !!record.base.ended_at) ? draft : null,
      pending: record?.pending.length ?? 0,
      finishPending: !!record?.finish || !!record?.base.ended_at,
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
  private withActivity(record: SavedQueue, occurredAt: string): SavedQueue {
    const lastCheckpoint =
      record.activityTrail?.at(-1) ?? record.base.last_activity_at ?? record.base.started_at;
    const activityTrail =
      Date.parse(occurredAt) - Date.parse(lastCheckpoint) >= 30 * 60_000
        ? [...(record.activityTrail ?? []), occurredAt]
        : record.activityTrail;
    return { ...record, lastActivityAt: occurredAt, ...(activityTrail ? { activityTrail } : {}) };
  }
  async restore() {
    try {
      const record = this.read();
      if (record) this.publish(record, { ready: true });
      if (record?.lastActivityAt || record?.activityTrail?.length) await this.sync();
      else if (!record?.pending.length && !record?.finish) await this.refresh();
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
      if (
        this.read()?.pending.length ||
        this.read()?.finish ||
        this.read()?.lastActivityAt ||
        this.read()?.activityTrail?.length
      )
        return;
      const server = await this.options.load();
      const previous = this.read();
      let ended: TrainingSession | null = null;
      if (!server && previous && !previous.pending.length) {
        try {
          ended = await this.options.reconcile(
            previous.base.id,
            previous.base.last_activity_at ?? previous.base.started_at,
          );
        } catch {
          // 手動終了や削除済みの記録は通常の再読込へ進む。
        }
      }
      await this.options.lock("store", async () => {
        if (
          this.read()?.pending.length ||
          this.read()?.finish ||
          this.read()?.lastActivityAt ||
          this.read()?.activityTrail?.length
        )
          return;
        this.write(server ? { base: server, pending: [] } : null, {
          ready: true,
          status: "idle",
          error: "",
          ...(server ? { saved: null } : {}),
          ...(ended?.auto_ended ? { saved: ended } : {}),
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
        ...(session && !session.ended_at ? { saved: null } : {}),
      });
    });
  }
  async touch(occurredAt: string) {
    await this.options.lock("store", async () => {
      const record = this.read();
      if (!record || record.finish || record.conflict || record.base.ended_at) return;
      this.write(this.withActivity(record, occurredAt));
    });
  }
  async enqueue(exercises: Exercise[], revision: number) {
    return this.options.lock("store", async () => {
      const record = this.read();
      if (!record || record.conflict || record.finish || record.base.ended_at)
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
        ...this.withActivity(record, new Date().toISOString()),
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
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }
    this.running = this.options
      .lock("send", async () => {
        while (!this.stopped) {
          const record = this.read();
          const job = record?.pending[0];
          const checkpoint = record?.activityTrail?.[0];
          if (
            !record ||
            record.conflict ||
            (!job &&
              !checkpoint &&
              !record.finish &&
              !record.lastActivityAt &&
              !record.base.ended_at)
          ) {
            this.publish(record);
            return;
          }
          this.publish(record, { status: "syncing", error: "" });
          try {
            if (checkpoint) {
              const result = await this.options.reconcile(record.base.id, checkpoint);
              if (
                (record.pending.length || record.finish) &&
                (JSON.stringify(result.exercises) !== JSON.stringify(record.base.exercises) ||
                  (result.revision !== record.base.revision && !result.auto_ended))
              )
                throw Object.assign(new Error("別の更新があります。"), { status: 409 });
              await this.options.lock("store", async () => {
                const latest = this.read();
                if (latest?.base.id !== record.base.id || latest.activityTrail?.[0] !== checkpoint)
                  return;
                this.write({
                  ...latest,
                  base: result,
                  activityTrail: latest.activityTrail.slice(1),
                });
              });
              continue;
            }
            if (record.lastActivityAt && !job && !record.finish) {
              const result = await this.options.reconcile(record.base.id, record.lastActivityAt);
              await this.options.lock("store", async () => {
                const latest = this.read();
                if (latest?.base.id !== record.base.id) return;
                this.write(
                  {
                    ...latest,
                    base: result,
                    ...(latest.lastActivityAt === record.lastActivityAt
                      ? { lastActivityAt: undefined }
                      : {}),
                  },
                  { status: "idle", error: "" },
                );
              });
              continue;
            }
            if (!job && !record.finish && record.base.ended_at) {
              await this.options.lock("store", async () => {
                if (this.read()?.base.id === record.base.id)
                  this.write(null, { status: "idle", error: "", saved: record.base });
              });
              continue;
            }
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
            const result = await this.options.send(
              record.base.id,
              record.base.revision,
              exercises,
              record.lastActivityAt ?? record.base.last_activity_at ?? record.base.started_at,
            );
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
                  ...(latest.lastActivityAt ? { lastActivityAt: latest.lastActivityAt } : {}),
                  ...(latest.activityTrail?.length ? { activityTrail: latest.activityTrail } : {}),
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
      .finally(async () => {
        this.running = null;
        const rerun = this.rerunRequested && !this.stopped;
        this.rerunRequested = false;
        if (rerun) await this.sync();
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
