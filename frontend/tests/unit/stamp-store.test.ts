import { describe, expect, test } from "bun:test";
import { type StampJob, StampStore } from "../../src/features/stamps/stamp-store";
import type { StampSummary } from "../../src/features/stamps/types";
const blank = (): StampSummary => ({ counts: {}, mine: [], can_send: true });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function fixture() {
  const saved = new Map<string, StampJob>();
  const calls: { path: string; method?: string; ids?: string[] }[] = [];
  let summary = blank();
  let mutation: () => Promise<unknown> = async () => {
    summary = { counts: { praise: 1 }, mine: ["praise"], can_send: true };
  };
  let failRead = false;
  let sequence = 0;
  const options = {
    request: async <T>(path: string, options?: RequestInit): Promise<T> => {
      const ids = options?.body ? JSON.parse(String(options.body)).workout_ids : undefined;
      calls.push({ path, method: options?.method, ids });
      if (path.endsWith("summary")) {
        if (failRead) throw new Error("read failed");
        return Object.fromEntries(ids.map((id: string) => [id, summary])) as T;
      }
      return (await mutation()) as T;
    },
    read: () => [...saved.values()],
    write: (job: StampJob) => {
      saved.set(job.id, job);
    },
    remove: (job: StampJob) => {
      saved.delete(job.id);
    },
    lock: async (_key: string, work: () => Promise<void>) => work(),
    id: () => String(++sequence),
  };
  const store = new StampStore(options);
  store.start();
  return {
    store,
    saved,
    calls,
    options,
    setMutation: (fn: typeof mutation) => {
      mutation = fn;
    },
    setSummary: (value: StampSummary) => {
      summary = value;
    },
    failRead: () => {
      failRead = true;
    },
  };
}
describe("画面から独立したスタンプ送信", () => {
  test("即時反映・同じ種類の連打防止・別種類は操作可能", async () => {
    const f = fixture();
    await f.store.refresh("g", ["w"]);
    let finish!: () => void;
    f.setMutation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    expect(f.store.toggle("g", "w", "praise", "名前")).toBe(true);
    expect(f.store.view("g", "w")?.counts.praise).toBe(1);
    expect(f.store.toggle("g", "w", "praise", "名前")).toBe(false);
    expect(f.saved.size).toBe(1);
    finish();
    await tick();
    expect(f.store.jobs).toHaveLength(0);
    f.store.stop();
  });
  test("失敗時に戻し、応答を失った成功は再送せず照合する", async () => {
    const f = fixture();
    await f.store.refresh("g", ["w"]);
    f.setMutation(async () => {
      throw new Error("offline");
    });
    f.store.toggle("g", "w", "praise", "名前");
    await tick();
    expect(f.store.view("g", "w")?.counts.praise ?? 0).toBe(0);
    expect(f.store.jobs[0].state).toBe("failed");
    f.setSummary({ counts: { praise: 1 }, mine: ["praise"], can_send: true });
    f.store.retry(f.store.jobs[0].id);
    await tick();
    expect(f.calls.filter((call) => call.method === "PUT")).toHaveLength(1);
    expect(f.store.jobs).toHaveLength(0);
    expect(f.store.view("g", "w")?.counts.praise).toBe(1);
    f.store.stop();
  });
  test("書込み成功後の再取得失敗では未送信にしない", async () => {
    const f = fixture();
    await f.store.refresh("g", ["w"]);
    f.failRead();
    f.store.toggle("g", "w", "praise", "名前");
    await tick();
    expect(f.store.jobs).toHaveLength(0);
    expect(f.store.view("g", "w")?.counts.praise).toBe(1);
    f.store.stop();
  });
  test("再起動時は自動送信せず本人の確認後に再試行する", async () => {
    const f = fixture();
    await f.store.refresh("g", ["w"]);
    f.setMutation(async () => {
      throw new Error("offline");
    });
    f.store.toggle("g", "w", "praise", "名前");
    await tick();
    f.store.stop();
    const restored = new StampStore(f.options);
    restored.start();
    expect(restored.jobs[0].state).toBe("failed");
    expect(f.calls.filter((call) => call.method === "PUT")).toHaveLength(1);
    restored.stop();
  });
  test("一覧を50件ずつまとめて取得する", async () => {
    const f = fixture();
    await f.store.refresh(
      "g",
      Array.from({ length: 101 }, (_, i) => String(i)),
    );
    expect(f.calls.map((call) => call.ids?.length)).toEqual([50, 50, 1]);
    f.store.stop();
  });
  test("端末保存が失敗したら送信しない", async () => {
    const f = fixture();
    const store = new StampStore({
      ...f.options,
      write: () => {
        throw new Error("quota");
      },
    });
    store.start();
    await store.refresh("g", ["w"]);
    expect(store.toggle("g", "w", "praise", "名前")).toBe(false);
    expect(f.calls.filter((call) => call.method === "PUT")).toHaveLength(0);
    expect(store.storageError).not.toBe("");
    store.stop();
    f.store.stop();
  });
});

test("取消失敗は選択と件数を戻し、再試行でDELETEする", async () => {
  const f = fixture();
  f.setSummary({ counts: { praise: 2 }, mine: ["praise"], can_send: true });
  await f.store.refresh("g", ["w"]);
  f.setMutation(async () => {
    throw new Error("offline");
  });
  f.store.toggle("g", "w", "praise", "名前");
  expect(f.store.view("g", "w")?.counts.praise).toBe(1);
  await tick();
  expect(f.store.view("g", "w")?.mine).toContain("praise");
  expect(f.store.view("g", "w")?.counts.praise).toBe(2);
  f.setMutation(async () => {
    f.setSummary({ counts: { praise: 1 }, mine: [], can_send: true });
  });
  f.store.retry(f.store.jobs[0].id);
  await tick();
  expect(f.calls.filter((call) => call.method === "DELETE")).toHaveLength(2);
  expect(f.store.view("g", "w")?.counts.praise).toBe(1);
  expect(f.store.jobs).toHaveLength(0);
  f.store.stop();
});

test("ログアウト後の遅い完了を採用せず、別ユーザーへ再送しない", async () => {
  const f = fixture();
  await f.store.refresh("g", ["w"]);
  let finish!: () => void;
  f.setMutation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  f.store.toggle("g", "w", "praise", "名前");
  f.store.stop();
  finish();
  await tick();
  expect(f.saved.size).toBe(1);
  expect(f.store.toggle("g", "w", "encourage", "名前")).toBe(false);
  expect(f.calls.filter((call) => call.method === "PUT")).toHaveLength(1);
});

test("権限喪失時は件数を隠して再試行対象を破棄する", async () => {
  const f = fixture();
  await f.store.refresh("g", ["w"]);
  f.setMutation(async () => {
    throw Object.assign(new Error("共有解除"), { status: 404 });
  });
  f.store.toggle("g", "w", "praise", "名前");
  await tick();
  expect(f.store.view("g", "w")).toBeUndefined();
  expect(f.store.jobs).toHaveLength(0);
  expect(f.saved.size).toBe(0);
  f.store.stop();
});
