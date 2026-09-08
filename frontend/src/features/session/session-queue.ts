import type { Exercise, TrainingSession } from "@/lib/api";

type Pending = { id: string; exercises: Exercise[] };
type SavedQueue = { base: TrainingSession; pending: Pending[]; conflict?: boolean };
export type QueueState = {
  session: TrainingSession | null;
  pending: number;
  status: "idle" | "syncing" | "offline" | "conflict";
  error: string;
  ready: boolean;
  confirmedRevision: number;
  saved: TrainingSession | null;
};
type Options = {
  read: () => string | null;
  write: (value: string | null) => void;
  lock: <T>(name: string, work: () => Promise<T>) => Promise<T>;
  load: () => Promise<TrainingSession | null>;
  send: (id: string, revision: number, exercises: Exercise[]) => Promise<TrainingSession>;
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
    const value = JSON.parse(raw);
    if (
      !value?.base?.id ||
      !Number.isInteger(value.base.revision) ||
      !Array.isArray(value.base.exercises) ||
      !Array.isArray(value.pending) ||
      value.pending.some((p: Pending) => !p.id || !Array.isArray(p.exercises))
    )
      throw new Error("端末の保存待ちデータを読み取れません。データを削除せず確認してください。");
    return value;
  }
  private publish(record: SavedQueue | null, patch: Partial<QueueState> = {}) {
    const last = record?.pending.at(-1);
    this.state = {
      ...this.state,
      session: record
        ? {
            ...record.base,
            exercises: last?.exercises ?? record.base.exercises,
            revision: record.base.revision + record.pending.length,
          }
        : null,
      pending: record?.pending.length ?? 0,
      confirmedRevision: record?.base.revision ?? 0,
      ...patch,
      ...(record?.conflict ? { status: "conflict" as const } : {}),
    };
    for (const listener of this.listeners) listener();
  }
  private write(record: SavedQueue | null, patch: Partial<QueueState> = {}) {
    // 書き込み失敗時はUIにも追加しない。ACK後に失敗しても同じ要求を再送できる。
    try {
      this.options.write(record ? JSON.stringify(record) : null);
    } catch {
      throw new Error("この端末に記録を保存できません。空き容量やブラウザ設定を確認してください。");
    }
    this.publish(record, patch);
  }
  async restore() {
    try {
      const record = this.read();
      if (record) this.publish(record, { ready: true });
      if (!record?.pending.length) await this.refresh();
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
      if (this.read()?.pending.length) return;
      const server = await this.options.load();
      await this.options.lock("store", async () => {
        if (this.read()?.pending.length) return;
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
      if (this.read()?.pending.length) throw new Error("未送信の記録があります。");
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
      if (!record || record.conflict)
        throw new Error("保存済みとの違いを確認してください。端末の入力は保持しています。");
      const current = {
        ...record.base,
        exercises: record.pending.at(-1)?.exercises ?? record.base.exercises,
        revision: record.base.revision + record.pending.length,
      };
      if (revision !== current.revision)
        throw new Error("別の保存があります。セットを選び直してください。");
      if (JSON.stringify(exercises) === JSON.stringify(current.exercises)) return current;
      const next = {
        ...record,
        pending: [
          ...record.pending,
          { id: crypto.randomUUID(), exercises: structuredClone(exercises) },
        ],
      };
      this.write(next);
      return this.state.session as TrainingSession;
    });
  }
  sync() {
    if (this.running) return this.running;
    this.running = this.options
      .lock("send", async () => {
        while (!this.stopped) {
          const record = this.read();
          const job = record?.pending[0];
          if (!record || !job || record.conflict) {
            this.publish(record);
            return;
          }
          this.publish(record, { status: "syncing", error: "" });
          try {
            const result = await this.options.send(
              record.base.id,
              record.base.revision,
              job.exercises,
            );
            await this.options.lock("store", async () => {
              const latest = this.read();
              if (latest?.base.id !== record.base.id || latest.pending[0]?.id !== job.id) return;
              this.write(
                { base: result, pending: latest.pending.slice(1) },
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
