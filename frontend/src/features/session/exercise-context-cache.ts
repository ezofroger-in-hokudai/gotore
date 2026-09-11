import type { ExerciseContext } from "@/lib/api";

type Entry = {
  data: ExerciseContext | null;
  error: string;
  savedAt: number;
  controller?: AbortController;
};

// セッション内だけで比較情報を保持し、表示する種目を先読みより優先する。
export class ExerciseContextCache {
  private entries = new Map<string, Entry>();
  private wanted: string[] = [];
  private running = false;
  private revision: number | undefined;

  constructor(
    private load: (name: string, signal: AbortSignal) => Promise<ExerciseContext>,
    private changed: () => void,
    private now = Date.now,
  ) {}

  read(name: string) {
    return this.entries.get(name);
  }

  prepare(names: string[], revision: number) {
    if (this.revision !== revision) {
      this.invalidate(names[0]);
      this.revision = revision;
    }
    this.running = true;
    this.wanted = [...new Set(names.filter(Boolean))].slice(0, 4);
    for (const [name, entry] of this.entries) {
      if (entry.controller && !this.wanted.includes(name)) this.cancel(name, entry);
    }
    // 選択直後の取得枠は、優先度が低い候補の取得を中断して確保する。
    const selected = this.wanted[0];
    const selectedEntry = this.entries.get(selected);
    if (
      selected &&
      !selectedEntry?.controller &&
      !selectedEntry?.error &&
      (!selectedEntry?.data || this.now() - selectedEntry.savedAt >= 60_000) &&
      this.pending() >= 2
    ) {
      for (const name of [...this.wanted].reverse()) {
        const entry = this.entries.get(name);
        if (name !== selected && entry?.controller) {
          this.cancel(name, entry);
          break;
        }
      }
    }
    this.pump();
  }

  invalidate(retain = this.wanted[0]) {
    const previous = retain ? this.entries.get(retain)?.data : null;
    this.stop();
    this.entries.clear();
    if (retain && previous) this.entries.set(retain, { data: previous, error: "", savedAt: 0 });
  }

  stop() {
    this.running = false;
    for (const [name, entry] of this.entries) {
      if (entry.controller) this.cancel(name, entry);
    }
  }

  private cancel(name: string, entry: Entry) {
    entry.controller?.abort();
    // 中断済みの応答が、後から再開した取得や表示を上書きしないようにする。
    this.entries.set(name, { data: entry.data, error: "", savedAt: entry.savedAt });
  }

  private pending() {
    return [...this.entries.values()].filter((entry) => entry.controller).length;
  }

  private pump() {
    if (!this.running) return;
    for (const name of this.wanted) {
      if (this.pending() >= 2) break;
      const previous = this.entries.get(name);
      if (
        previous?.controller ||
        previous?.error ||
        (previous?.data && this.now() - previous.savedAt < 60_000)
      )
        continue;
      const controller = new AbortController();
      const entry: Entry = {
        data: previous?.data ?? null,
        error: "",
        savedAt: 0,
        controller,
      };
      this.entries.delete(name);
      this.entries.set(name, entry);
      while (this.entries.size > 5) {
        const oldest = [...this.entries.keys()].find((key) => !this.wanted.includes(key));
        if (!oldest) break;
        this.entries.delete(oldest);
      }
      void this.load(name, controller.signal)
        .then((data) => {
          if (this.entries.get(name) !== entry || controller.signal.aborted) return;
          entry.data = data;
          entry.savedAt = this.now();
        })
        .catch((reason) => {
          if (this.entries.get(name) !== entry || controller.signal.aborted) return;
          entry.data = null;
          entry.error =
            reason instanceof Error ? reason.message : "比較情報を取得できませんでした。";
        })
        .finally(() => {
          if (this.entries.get(name) !== entry || controller.signal.aborted) return;
          entry.controller = undefined;
          this.changed();
          this.pump();
        });
    }
  }
}
