import { expect, test } from "bun:test";
import { AnalyticsCache } from "../../src/features/analytics/cache";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("先読みを共有し、同じ取得を重複させず、再訪と有効期限を扱う", async () => {
  let calls = 0;
  let now = 0;
  const cache = new AnalyticsCache(
    async () => ++calls,
    () => now,
  );
  cache.request("a");
  cache.request("a", true);
  await tick();
  expect(cache.read("a")?.data).toBe(1);
  cache.request("a", true);
  expect(calls).toBe(1);
  now = 60_001;
  cache.request("a", true);
  await tick();
  expect(calls).toBe(2);
  cache.clear();
});

test("選択中を優先し、破棄後の遅い応答はキャッシュへ戻さない", async () => {
  const pending = new Map<string, (value: string) => void>();
  const signals = new Map<string, AbortSignal>();
  const cache = new AnalyticsCache((path, signal) => {
    signals.set(path, signal);
    return new Promise<string>((resolve) => pending.set(path, resolve));
  });
  cache.request("a");
  cache.request("b");
  cache.request("c", true);
  expect(signals.get("a")?.aborted).toBe(true);
  expect(pending.has("c")).toBe(true);
  cache.clear();
  pending.get("c")?.("遅い応答");
  await tick();
  expect(cache.read("c")).toBeUndefined();
});

test("容量を制限し、失敗時には以前の集計を消して再試行できる", async () => {
  let fail = false;
  const cache = new AnalyticsCache(async (path) => {
    if (fail) throw new Error("参加していません");
    return path;
  });
  for (let i = 0; i < 9; i++) {
    cache.request(String(i));
    await tick();
  }
  expect(cache.read("0")).toBeUndefined();
  fail = true;
  cache.request("8", true, true);
  await tick();
  expect(cache.read("8")?.data).toBeUndefined();
  expect(cache.read("8")?.error).toBe("参加していません");
  fail = false;
  cache.request("8", true, true);
  await tick();
  expect(cache.read("8")?.data).toBe("8");
  cache.clear();
});

test("権限エラーで別期間も消し、無効化後の再取得へ古い応答が混ざらない", async () => {
  let forbidden = false;
  const cache = new AnalyticsCache(async (path) => {
    if (forbidden) throw Object.assign(new Error("参加していません"), { status: 404 });
    return path;
  });
  cache.request("month");
  cache.request("week");
  await tick();
  forbidden = true;
  cache.request("month", true, true);
  await tick();
  expect(cache.read("week")).toBeUndefined();
  expect(cache.read("month")?.error).toBe("参加していません");
  cache.clear();
});
