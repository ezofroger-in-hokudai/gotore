import { expect, test } from "bun:test";
import { GroupHistoryCache } from "../../src/features/v2/group-history-cache";
import type { Workout } from "../../src/lib/api";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const path = "/groups/a/workouts?performed_on=2026-09-28&limit=50";
const first = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }) as Workout);

test("初回50件を先に表示し、51件の再確認中と一時的な失敗で全件を保持する", async () => {
  let finish: () => void = () => {};
  let fail = false;
  let extra = 0;
  const cache = new GroupHistoryCache(async <T>(url: string) => {
    if (!url.includes("offset")) return first as T;
    extra++;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    if (fail) throw Object.assign(new Error("通信失敗"), { status: 503 });
    return [{ id: "50" }] as T;
  });
  cache.days.request(path, true);
  cache.days.request(path, true);
  await tick();
  expect(cache.days.read(path)?.data).toHaveLength(50);
  expect(extra).toBe(1);
  finish();
  await tick();
  expect(cache.days.read(path)?.data).toHaveLength(51);
  fail = true;
  cache.days.request(path, true, true);
  await tick();
  expect(cache.days.read(path)?.data).toHaveLength(51);
  finish();
  await tick();
  expect(cache.days.read(path)?.data).toHaveLength(51);
  expect(cache.days.read(path)?.error).toBe("通信失敗");
  cache.clear();
});

test("権限を失ったグループだけの全履歴を削除し、他のグループと分離する", async () => {
  let denied = false;
  const cache = new GroupHistoryCache(async <T>(url: string) => {
    if (denied) throw Object.assign(new Error("権限なし"), { status: 403 });
    return (url.includes("workouts?") ? [] : { value: url }) as T;
  });
  const graphA = "/groups/a/analytics?period=all";
  const graphB = "/groups/b/analytics?period=all";
  const month = "/groups/a/workouts/activity?month=2026-09";
  cache.analytics.request(graphA);
  cache.analytics.request(graphB);
  cache.activity.request(month);
  cache.days.request(path);
  await tick();
  denied = true;
  cache.days.request(path, true, true);
  await tick();
  expect(cache.analytics.read(graphA)).toBeUndefined();
  expect(cache.activity.read(month)).toBeUndefined();
  expect(cache.days.read(path)?.data).toBeUndefined();
  expect(cache.analytics.read(graphB)?.data).toBeDefined();
  cache.retainGroups(new Set());
  expect(cache.analytics.read(graphB)).toBeUndefined();
  cache.clear();
});

test("所属解除後の遅い応答が記録を復元しない", async () => {
  let finish: (value: unknown) => void = () => {};
  const cache = new GroupHistoryCache(
    <T>() =>
      new Promise<T>((resolve) => {
        finish = resolve as (value: unknown) => void;
      }),
  );
  cache.days.request(path);
  cache.retainGroups(new Set());
  finish(first);
  await tick();
  expect(cache.days.read(path)).toBeUndefined();
});
