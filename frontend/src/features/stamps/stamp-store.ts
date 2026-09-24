import { type StampKind, type StampSummary, stampKinds } from "./types";

export type StampJob = {
  id: string;
  group: string;
  workout: string;
  name: string;
  kind: StampKind;
  present: boolean;
  state: "staged" | "pending" | "failed";
  error: string;
};
export type StampEntry = { summary?: StampSummary; error: string; revision: number };
type Options = {
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  read: () => unknown[];
  write: (job: StampJob) => void;
  remove: (job: StampJob) => void;
  lock: (key: string, work: () => Promise<void>) => Promise<void>;
  id: () => string;
};
const empty: StampEntry = { error: "", revision: 0 };
// グループは記録を開く経路だけに使う。同じ記録のスタンプ状態は全グループで共有する。
export const stampKey = (_group: string, workout: string) => workout;
const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : "送れませんでした。再試行してください。";
const forbidden = (reason: unknown) =>
  !!reason &&
  typeof reason === "object" &&
  "status" in reason &&
  [401, 403, 404, 409].includes(Number(reason.status));
function validJob(value: unknown): value is StampJob {
  if (!value || typeof value !== "object") return false;
  const j = value as StampJob;
  return (
    typeof j.id === "string" &&
    typeof j.group === "string" &&
    typeof j.workout === "string" &&
    typeof j.name === "string" &&
    typeof j.present === "boolean" &&
    stampKinds.some((k) => k.id === j.kind)
  );
}

// 画面部品の寿命から送信を切り離し、同じ記録の表示を一か所で管理する。
export class StampStore {
  private entries = new Map<string, StampEntry>();
  private listeners = new Set<() => void>();
  private controllers = new Set<AbortController>();
  private running = new Set<string>();
  private active = false;
  private loaded = false;
  private version = 0;
  jobs: StampJob[] = [];
  storageError = "";
  constructor(private options: Options) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.version;
  private publish() {
    this.version++;
    for (const fn of this.listeners) fn();
  }
  start() {
    this.active = true;
    if (this.loaded) return;
    this.loaded = true;
    try {
      const data = this.options.read();
      if (data.some((j) => !validJob(j)))
        this.storageError = "読み取れないスタンプ送信待ちがあります。端末の情報は保持しています。";
      this.jobs = data.filter(validJob).map((j) => ({
        ...j,
        state: "failed",
        error: "未完了の送信があります。確認して再試行してください。",
      }));
    } catch {
      this.storageError = "端末の送信待ちを読み取れません。";
    }
    this.publish();
  }
  stop() {
    this.active = false;
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
  }
  get(group: string, workout: string) {
    return this.entries.get(stampKey(group, workout)) ?? empty;
  }
  prune(visible: Set<string>) {
    const pending = new Set(this.jobs.map((job) => stampKey(job.group, job.workout)));
    for (const key of this.entries.keys()) {
      if (this.entries.size <= 200) break;
      if (!visible.has(key) && !pending.has(key)) this.entries.delete(key);
    }
  }
  private set(group: string, workout: string, update: Partial<StampEntry>) {
    const old = this.get(group, workout);
    this.entries.set(stampKey(group, workout), { ...old, ...update, revision: old.revision + 1 });
    this.publish();
  }
  forRecord(_group: string, workout: string) {
    return this.jobs.filter((j) => j.workout === workout);
  }
  view(group: string, workout: string): StampSummary | undefined {
    const base = this.get(group, workout).summary;
    if (!base) return;
    const counts = { ...base.counts };
    const mine = new Set(base.mine);
    for (const j of this.forRecord(group, workout).filter((j) => j.state !== "failed")) {
      const was = mine.has(j.kind);
      counts[j.kind] = Math.max(0, (counts[j.kind] ?? 0) + Number(j.present) - Number(was));
      if (j.present) mine.add(j.kind);
      else mine.delete(j.kind);
    }
    return { ...base, counts, mine: [...mine] };
  }
  private async request<T>(path: string, options?: RequestInit) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      return await this.options.request<T>(path, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
  async refresh(group: string, ids: string[]) {
    if (!this.active || !ids.length) return;
    const unique = [...new Set(ids)];
    for (let offset = 0; offset < unique.length && this.active; offset += 50) {
      const batch = unique.slice(offset, offset + 50);
      const versions = new Map(batch.map((id) => [id, this.get(group, id).revision]));
      try {
        const data = await this.request<Record<string, StampSummary>>(
          `/groups/${group}/stamps/summary`,
          {
            method: "POST",
            body: JSON.stringify({ workout_ids: batch }),
          },
        );
        if (!this.active) return;
        for (const id of batch) {
          if (!data[id]) {
            this.revoke(group, id);
            continue;
          }
          if (
            versions.get(id) !== this.get(group, id).revision ||
            this.forRecord(group, id).some((j) => j.state !== "failed")
          )
            continue;
          this.set(group, id, { summary: data[id], error: "" });
        }
      } catch (reason) {
        if (!this.active) return;
        for (const id of batch) {
          if (forbidden(reason)) this.revoke(group, id);
          else this.set(group, id, { error: "スタンプを取得できません。" });
        }
      }
    }
  }
  private revoke(group: string, workout: string) {
    this.set(group, workout, { summary: undefined, error: "この記録のスタンプを利用できません。" });
    for (const job of this.forRecord(group, workout)) this.discard(job.id);
  }
  private save(job: StampJob) {
    try {
      this.options.write(job);
      return true;
    } catch {
      this.storageError = "送信待ちを端末に保存できません。空き容量などを確認してください。";
      this.publish();
      return false;
    }
  }
  toggle(group: string, workout: string, kind: StampKind, name: string, defer = false) {
    const summary = this.view(group, workout);
    if (!this.active || !summary?.can_send) return false;
    const existing = this.forRecord(group, workout).find((job) => job.kind === kind);
    if (existing && (!defer || existing.state !== "staged")) return false;
    const present = !summary.mine.includes(kind);
    if (existing) this.discard(existing.id);
    // 詳細内で元の状態へ戻した場合は、送信する変更そのものを残さない。
    const basePresent = this.get(group, workout).summary?.mine.includes(kind) ?? false;
    if (defer && present === basePresent) return true;
    const job: StampJob = {
      id: this.options.id(),
      group,
      workout,
      kind,
      name,
      present,
      state: defer ? "staged" : "pending",
      error: "",
    };
    if (!this.save(job)) return false;
    this.jobs = [...this.jobs, job];
    this.set(group, workout, { error: "" });
    if (!defer) void this.send(job, false);
    return true;
  }
  flush(group: string, workout: string) {
    for (const job of this.forRecord(group, workout).filter((value) => value.state === "staged")) {
      const next = { ...job, state: "pending" as const, error: "" };
      if (!this.save(next)) continue;
      this.jobs = this.jobs.map((value) => (value.id === next.id ? next : value));
      this.publish();
      void this.send(next, false);
    }
  }
  discard(id: string) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || this.running.has(id)) return;
    try {
      this.options.remove(job);
    } catch {
      this.storageError = "送信待ちを端末から消去できません。再起動後に再確認してください。";
    }
    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.publish();
  }
  retry(id: string) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || !this.active || this.running.has(id)) return;
    const next = { ...job, state: "pending" as const, error: "" };
    if (!this.save(next)) return;
    this.jobs = this.jobs.map((j) => (j.id === id ? next : j));
    this.publish();
    void this.send(next, true);
  }
  private async send(job: StampJob, reconcile: boolean) {
    if (this.running.has(job.id)) return;
    this.running.add(job.id);
    let success = false;
    try {
      await this.options.lock(stampKey(job.group, job.workout), async () => {
        if (!this.active) return;
        if (reconcile) {
          const data = await this.request<Record<string, StampSummary>>(
            `/groups/${job.group}/stamps/summary`,
            {
              method: "POST",
              body: JSON.stringify({ workout_ids: [job.workout] }),
            },
          );
          if (!this.active) return;
          const fresh = data[job.workout];
          if (!fresh?.can_send)
            throw Object.assign(new Error("この記録には送れません。"), { status: 403 });
          this.set(job.group, job.workout, { summary: fresh, error: "" });
          success = fresh.mine.includes(job.kind) === job.present;
        }
        if (!success)
          await this.request(`/groups/${job.group}/workouts/${job.workout}/stamps/${job.kind}`, {
            method: job.present ? "PUT" : "DELETE",
          });
        if (!this.active) return;
        success = true;
        const base = this.get(job.group, job.workout).summary;
        if (base) {
          const counts = { ...base.counts };
          const mine = new Set(base.mine);
          counts[job.kind] = Math.max(
            0,
            (counts[job.kind] ?? 0) + Number(job.present) - Number(mine.has(job.kind)),
          );
          if (job.present) mine.add(job.kind);
          else mine.delete(job.kind);
          this.set(job.group, job.workout, {
            summary: { ...base, counts, mine: [...mine] },
            error: "",
          });
        }
      });
    } catch (reason) {
      if (!this.active) return;
      if (forbidden(reason)) {
        this.running.delete(job.id);
        this.revoke(job.group, job.workout);
        return;
      }
      const failed = { ...job, state: "failed" as const, error: message(reason) };
      this.save(failed);
      this.jobs = this.jobs.map((j) => (j.id === job.id ? failed : j));
      this.publish();
    } finally {
      this.running.delete(job.id);
      if (success && this.active) {
        this.discard(job.id);
        // 書込み成功後の再取得失敗を「送信失敗」に戻さない。
        void this.refresh(job.group, [job.workout]);
      }
    }
  }
}
