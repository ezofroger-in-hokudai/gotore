import type { Memo } from "./memo-draft";
import { memoDraftKey } from "./memo-draft";

export type MemoTarget = { path: string; name?: string; label: string };
type Storage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  keys: () => string[];
};
type Request = { content: string; revision: number };
export type MemoEntry = {
  target: MemoTarget;
  memo: Memo | null;
  content: string;
  dirty: boolean;
  phase: "idle" | "sending" | "error";
  error: string;
  errorStatus?: number;
  storageError: boolean;
  queue: Request[];
};
const validMemo = (value: unknown): value is Memo => {
  const memo = value as Memo | null;
  return (
    !!memo &&
    typeof memo.content === "string" &&
    memo.content.length <= 1000 &&
    Number.isSafeInteger(memo.revision) &&
    memo.revision >= 0
  );
};
const validTarget = (value: unknown): value is MemoTarget => {
  const target = value as MemoTarget | null;
  return (
    !!target &&
    typeof target.path === "string" &&
    typeof target.label === "string" &&
    target.label.length <= 200 &&
    (target.name === undefined || typeof target.name === "string") &&
    (/^\/workouts\/[^/?]+\/memo$/.test(target.path) ||
      /^\/sessions\/[^/?]+\/exercise-memo\?name=.+$/.test(target.path) ||
      (target.path === "/exercises/memo" && !!target.name))
  );
};

export class MemoDeliveryStore {
  private entries = new Map<string, MemoEntry>();
  private listeners = new Set<() => void>();
  private generation = 0;
  private stopped = false;
  private restored = false;
  private controllers = new Set<AbortController>();
  private prefix: string;
  constructor(
    private userId: string,
    private storage: Storage,
    private send: (target: MemoTarget, memo: Memo, signal: AbortSignal) => Promise<Memo>,
    private onSaved: () => void = () => {},
  ) {
    this.prefix = `gotore:memo-send:v1:${userId}:`;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  notify() {
    this.changed();
  }
  private changed() {
    for (const listener of this.listeners) listener();
  }
  private id(target: MemoTarget) {
    return target.name ?? target.path;
  }
  private draftKey(target: MemoTarget) {
    return memoDraftKey(this.userId, this.id(target));
  }
  private requestKey(target: MemoTarget) {
    return this.prefix + this.id(target);
  }
  read(target: MemoTarget): MemoEntry {
    const id = this.id(target);
    const current = this.entries.get(id);
    if (current) return current;
    let draft: Memo | null = null;
    let storageError = false;
    try {
      const stored = JSON.parse(this.storage.getItem(this.draftKey(target)) ?? "null");
      if (validMemo(stored)) draft = stored;
    } catch {
      storageError = true;
    }
    const entry: MemoEntry = {
      target,
      memo: draft,
      content: draft?.content ?? "",
      dirty: !!draft,
      phase: "idle",
      error: "",
      storageError,
      queue: [],
    };
    this.entries.set(id, entry);
    return entry;
  }
  prime(target: MemoTarget, memo: Memo) {
    const entry = this.read(target);
    // 編集元の版は未送信入力と一緒に保持し、遅いGETで差し替えない。
    if (!entry.dirty && !entry.queue.length && memo.revision >= (entry.memo?.revision ?? 0)) {
      entry.memo = memo;
      entry.content = memo.content;
      this.changed();
    }
  }
  private draft(entry: MemoEntry) {
    try {
      if (entry.dirty)
        this.storage.setItem(
          this.draftKey(entry.target),
          JSON.stringify({
            content: entry.content,
            revision: entry.memo?.revision ?? 0,
          }),
        );
      else this.storage.removeItem(this.draftKey(entry.target));
      entry.storageError = false;
      return true;
    } catch {
      entry.storageError = true;
      return false;
    }
  }
  private persist(entry: MemoEntry) {
    try {
      if (entry.queue.length)
        this.storage.setItem(
          this.requestKey(entry.target),
          JSON.stringify({
            target: entry.target,
            queue: entry.queue,
          }),
        );
      else this.storage.removeItem(this.requestKey(entry.target));
      return true;
    } catch {
      entry.storageError = true;
      return false;
    }
  }
  edit(target: MemoTarget, content: string) {
    const entry = this.read(target);
    entry.content = content;
    entry.dirty = true;
    this.draft(entry);
    this.changed();
  }
  enqueue(target: MemoTarget): boolean {
    const entry = this.read(target);
    if (!entry.memo || this.stopped) return false;
    const request = { content: entry.content, revision: entry.memo.revision };
    const last = entry.queue.at(-1);
    if (!last || last.content !== request.content || last.revision !== request.revision) {
      // 送信中の先頭は固定し、続く保存は最新の一件だけ残す。
      if (entry.queue.length) entry.queue.splice(1, entry.queue.length, request);
      else entry.queue = [request];
    }
    const stored = this.draft(entry) && this.persist(entry);
    entry.error = "";
    entry.errorStatus = undefined;
    if (entry.phase !== "sending") void this.flush(entry);
    this.changed();
    return stored;
  }
  private async flush(entry: MemoEntry) {
    if (this.stopped || entry.phase === "sending" || !entry.queue.length) return;
    const request = entry.queue[0];
    const generation = this.generation;
    const controller = new AbortController();
    this.controllers.add(controller);
    entry.phase = "sending";
    entry.error = "";
    entry.errorStatus = undefined;
    this.changed();
    try {
      const value = await this.send(entry.target, request, controller.signal);
      if (
        this.stopped ||
        generation !== this.generation ||
        this.entries.get(this.id(entry.target)) !== entry
      )
        return;
      if (!validMemo(value)) throw new Error("保存結果を確認できません。");
      entry.memo = value;
      entry.queue.shift();
      for (const next of entry.queue) {
        if (next.revision === request.revision) next.revision = value.revision;
      }
      if (entry.content === request.content) {
        entry.content = value.content;
        entry.dirty = false;
      }
      this.draft(entry);
      this.persist(entry);
      entry.phase = "idle";
      this.onSaved();
    } catch (error) {
      if (
        this.stopped ||
        generation !== this.generation ||
        this.entries.get(this.id(entry.target)) !== entry
      )
        return;
      entry.phase = "error";
      entry.errorStatus =
        error && typeof error === "object" && "status" in error && typeof error.status === "number"
          ? error.status
          : undefined;
      entry.error = error instanceof Error ? error.message : "メモを保存できません。";
    } finally {
      this.controllers.delete(controller);
      if (!this.stopped && generation === this.generation) {
        this.changed();
        if (entry.phase === "idle") void this.flush(entry);
      }
    }
  }
  retry(target: MemoTarget) {
    const entry = this.read(target);
    if (!entry.queue.length) this.enqueue(target);
    else void this.flush(entry);
  }
  discard(target: MemoTarget, memo: Memo) {
    const entry = this.read(target);
    if (entry.phase === "sending") return false;
    entry.queue = [];
    entry.memo = memo;
    entry.content = memo.content;
    entry.dirty = false;
    entry.phase = "idle";
    entry.error = "";
    entry.errorStatus = undefined;
    this.draft(entry);
    this.persist(entry);
    this.changed();
    return true;
  }
  pending() {
    return [...this.entries.values()].filter((entry) => entry.queue.length || entry.storageError);
  }
  restore() {
    if (this.restored) return;
    this.restored = true;
    let keys: string[];
    try {
      keys = this.storage.keys();
    } catch {
      return;
    }
    for (const key of keys.filter((key) => key.startsWith(this.prefix))) {
      try {
        const saved = JSON.parse(this.storage.getItem(key) ?? "null");
        if (
          !validTarget(saved?.target) ||
          key !== this.requestKey(saved.target) ||
          !Array.isArray(saved.queue) ||
          !saved.queue.length ||
          saved.queue.length > 2 ||
          !saved.queue.every(validMemo)
        )
          continue;
        const entry = this.read(saved.target);
        entry.queue = saved.queue;
        entry.memo ??= saved.queue[0];
        if (!entry.dirty) entry.content = saved.queue.at(-1).content;
        entry.dirty = true;
        void this.flush(entry);
      } catch {
        /* 壊れた要求は自動送信せず、既存の下書きを保持する。 */
      }
    }
    this.changed();
  }
  start() {
    this.stopped = false;
    this.restore();
    for (const entry of this.entries.values()) if (entry.queue.length) void this.flush(entry);
  }
  stop() {
    this.stopped = true;
    this.generation++;
    for (const controller of this.controllers) controller.abort();
    for (const entry of this.entries.values()) if (entry.phase === "sending") entry.phase = "idle";
  }
  removeWorkout(id: string) {
    for (const [key, entry] of this.entries) {
      if (
        entry.target.path.startsWith(`/workouts/${id}/`) ||
        entry.target.path.startsWith(`/sessions/${id}/`)
      ) {
        entry.queue = [];
        entry.dirty = false;
        this.draft(entry);
        this.persist(entry);
        this.entries.delete(key);
      }
    }
    // まだ画面に開いていない種目メモの下書きも、削除成功後だけ除去する。
    try {
      const prefix = memoDraftKey(this.userId, `/sessions/${id}/exercise-memo?name=`);
      for (const key of this.storage.keys())
        if (key.startsWith(prefix)) this.storage.removeItem(key);
    } catch {
      /* 端末側の削除失敗では未送信入力を破棄しない。 */
    }
    this.changed();
  }
}
