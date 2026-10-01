import { expect, test } from "bun:test";
import { DemoStore } from "../../src/features/demo/demo-store";
import { isDemoPath } from "../../src/features/demo/mode";
import { readQueue, writeQueue } from "../../src/features/session/queue-storage";
import type { TrainingSession } from "../../src/lib/api";
import { validChanges, validSnapshot } from "../../src/lib/record-snapshot";

test("デモ経路だけを対象にし、本番や似た名前の経路を含めない", () => {
  expect(isDemoPath("/demo")).toBe(true);
  expect(isDemoPath("/demo/")).toBe(true);
  for (const path of ["/", "/auth/callback", "/demonstration", "/demo-other"]) {
    expect(isDemoPath(path)).toBe(false);
  }
});
test("ezofrogsの架空データで記録開始・保存・終了し、再度開始できる", async () => {
  const store = new DemoStore("demo-test");
  const groups = await store.request("/groups");
  expect(groups).toMatchObject([{ name: "ezofrogs" }]);
  const session = (await store.request("/sessions", {
    method: "POST",
    body: JSON.stringify({ id: "one", started_at: new Date().toISOString() }),
  })) as { id: string; revision: number };
  expect(readQueue(writeQueue({ base: session as TrainingSession, pending: [] })).base.id).toBe(
    "one",
  );
  await store.request("/sessions/one", {
    method: "PATCH",
    body: JSON.stringify({
      expected_revision: session.revision,
      exercises: [{ name: "ベンチプレス", sets: [{ weight: 85, reps: 8 }] }],
    }),
  });
  await expect(
    store.request("/sessions/one", {
      method: "PATCH",
      body: JSON.stringify({ expected_revision: 1, exercises: [] }),
    }),
  ).rejects.toMatchObject({ status: 409 });
  await store.request("/sessions/one/finish", {
    method: "POST",
    body: JSON.stringify({ expected_revision: 2 }),
  });
  expect(await store.request("/sessions/active")).toBeNull();
  expect(((await store.request("/workouts?offset=0")) as { id: string }[])[0]).toMatchObject({
    id: "one",
    exercises: [{ name: "ベンチプレス" }],
  });
  await expect(
    store.request("/sessions", { method: "POST", body: JSON.stringify({ id: "two" }) }),
  ).resolves.toMatchObject({ id: "two" });
});
test("大量スタンプと開始のイベントは実表示と同じ受信・既読APIで扱う", async () => {
  const store = new DemoStore("demo-test");
  store.receive("stamp", 20);
  store.receive("start", 8);
  const inbox = (await store.request("/notifications/inbox")) as {
    items: { id: string }[];
    live_start_ids: string[];
  };
  expect(inbox.items).toHaveLength(28);
  expect(inbox.live_start_ids).toHaveLength(8);
  await store.request("/notifications/seen", {
    method: "POST",
    body: JSON.stringify({ ids: inbox.items.map((x) => x.id) }),
  });
  expect(await store.request("/notifications/inbox")).toMatchObject({
    items: [],
    live_start_ids: inbox.live_start_ids,
  });
});
test("未対応の操作はネットワークへ流さず、保存応答は複製して返す", async () => {
  const store = new DemoStore("demo-test");
  const groups = (await store.request("/groups")) as { name: string }[];
  groups[0].name = "changed";
  expect(await store.request("/groups")).toMatchObject([{ name: "ezofrogs" }]);
  await expect(store.request("/unsupported")).rejects.toMatchObject({ status: 404 });
});

test("共通の記録キャッシュへ本人の記録だけを渡し、削除後の差分を返す", async () => {
  const store = new DemoStore("demo-test");
  const snapshot = await store.request("/me/record-snapshot");
  expect(validSnapshot(snapshot, "demo-test")).toBe(true);
  await store.request("/workouts/demo-history-0", { method: "DELETE" });
  const changes = await store.request("/me/record-snapshot/changes", {
    method: "POST",
    body: JSON.stringify({ workouts: [{ id: "demo-history-0" }] }),
  });
  expect(validChanges(changes, "demo-test")).toBe(true);
  expect(changes).toMatchObject({ deleted_workout_ids: ["demo-history-0"] });
});

test("終了済みの開始はデモでも保留カットインの対象から外す", async () => {
  const store = new DemoStore("demo-test");
  store.receive("start", 2);
  const ended = store.state.records.find((x) => x.id === "demo-peer-0");
  if (!ended) throw new Error("開始した記録がありません");
  ended.ended_at = new Date().toISOString();
  const inbox = (await store.request("/notifications/inbox")) as { live_start_ids: string[] };
  expect(inbox.live_start_ids).toEqual([store.state.notices[1].id]);
});

test("グループカレンダーはLIVE一覧と分けて月別の負荷を返す", async () => {
  const store = new DemoStore("demo-test");
  const month = store.state.records[0].performed_on.slice(0, 7);
  const activity = await store.request(`/groups/demo-ezofrogs/workouts/activity?month=${month}`);
  expect(activity).toMatchObject({ month, metric: "volume" });
  expect((activity as { days: unknown[] }).days.length).toBeGreaterThan(0);
  const live = await store.request("/groups/demo-ezofrogs/activity");
  expect(live).toHaveProperty("members");
});
