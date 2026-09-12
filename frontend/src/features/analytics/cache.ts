import { canRetainResource } from "../training/retain-resource";

type Entry<T> = { data?: T; error?: string; savedAt: number; loading: boolean };
type Job = { path: string; selected: boolean; controller: AbortController };

export class AnalyticsCache<T> {
  private entries = new Map<string, Entry<T>>();
  private jobs = new Map<string, Job>();
  private listeners = new Set<() => void>();
  private revision = 0;
  constructor(
    private load: (path: string, signal: AbortSignal) => Promise<T>,
    private now = () => Date.now(),
    private ttl = 60_000,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.revision;
  private emit() {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  read(path: string) {
    return this.entries.get(path);
  }
  request(path: string, selected = false, force = false) {
    const existing = this.jobs.get(path);
    if (existing) {
      existing.selected ||= selected;
      return;
    }
    const entry = this.entries.get(path);
    if (
      !force &&
      !entry?.error &&
      entry?.data !== undefined &&
      this.now() - entry.savedAt < this.ttl
    )
      return;
    if (this.jobs.size >= 2) {
      if (!selected) return;
      const victim = [...this.jobs.values()].find((job) => !job.selected);
      if (!victim) return;
      this.cancel(victim);
    }
    const job = { path, selected, controller: new AbortController() };
    this.jobs.set(path, job);
    this.entries.delete(path);
    this.entries.set(path, {
      ...entry,
      savedAt: entry?.savedAt ?? 0,
      error: undefined,
      loading: true,
    });
    this.trim();
    this.emit();
    void this.load(path, job.controller.signal)
      .then((data) => {
        if (job.controller.signal.aborted) return;
        this.entries.set(path, { data, savedAt: this.now(), loading: false });
      })
      .catch((error: unknown) => {
        if (job.controller.signal.aborted) return;
        const retain = canRetainResource(error);
        if (!retain) {
          this.clear();
        }
        this.entries.set(path, {
          data: retain ? entry?.data : undefined,
          error: error instanceof Error ? error.message : "取得できませんでした。",
          savedAt: retain ? (entry?.savedAt ?? 0) : 0,
          loading: false,
        });
        this.emit();
      })
      .finally(() => {
        if (this.jobs.get(path) !== job) return;
        this.jobs.delete(path);
        this.emit();
      });
  }
  private trim() {
    while (this.entries.size > 8) {
      const key = [...this.entries.keys()].find((path) => !this.jobs.has(path));
      if (!key) break;
      this.entries.delete(key);
    }
  }
  private cancel(job: Job) {
    job.controller.abort();
    this.jobs.delete(job.path);
    const entry = this.entries.get(job.path);
    if (entry?.data !== undefined) this.entries.set(job.path, { ...entry, loading: false });
    else this.entries.delete(job.path);
  }
  select(path: string) {
    for (const job of this.jobs.values()) job.selected = job.path === path;
  }
  stop() {
    for (const job of [...this.jobs.values()]) this.cancel(job);
    this.emit();
  }
  clear() {
    this.stop();
    this.entries.clear();
    this.emit();
  }
}
