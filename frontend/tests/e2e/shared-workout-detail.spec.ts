import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

test("友達の記録を全種目・全セットで表示し、再読込で共有権限を再確認する", async ({ page }) => {
  const state = await mockTraining(page);
  const record = {
    id: "shared-record",
    user_id: "friend",
    display_name: "友達A",
    group_id: state.group.id,
    performed_on: "2026-01-02",
    created_at: "2026-01-02T01:00:00Z",
    revision: 1,
    exercises: [
      ["ベンチプレス", 5, 80],
      ["インクラインダンベルプレス", 4, 32],
      ["ラットプルダウン", 5, 70],
      ["シーテッドロー", 4, 60],
      ["スクワット", 4, 100],
    ].map(([name, count, weight]) => ({
      name: String(name),
      sets: Array.from({ length: Number(count) }, (_, index) => ({
        weight: Number(weight) - index * 5,
        reps: 8 + index,
      })),
    })),
  };
  await page.route(`**/api/groups/${state.group.id}/activity`, (route) =>
    route.fulfill({
      json: {
        group_id: state.group.id,
        member_count: 2,
        live_count: 0,
        today_count: 1,
        members: [],
        feed: [
          {
            workout_id: record.id,
            user_id: record.user_id,
            display_name: record.display_name,
            exercise: "スクワット",
            weight: 100,
            reps: 5,
            estimated_rm: 116.7,
            updated_at: "2026-09-11T00:00:00Z",
            best: false,
          },
        ],
      },
    }),
  );
  let reads = 0;
  let fail = false;
  const path = `/api/groups/${state.group.id}/workouts/${record.id}`;
  await page.route(`**${path}/stamps?offset=*`, (route) =>
    route.fulfill({
      json: {
        target: { group_name: state.group.name, performed_on: record.performed_on },
        items: [
          {
            id: "stamp-praise-a",
            workout_id: record.id,
            group_id: state.group.id,
            group_name: state.group.name,
            sender_id: "member-a",
            display_name: "ミオ",
            kind: "praise",
            created_at: "2026-01-02T01:00:00Z",
            performed_on: record.performed_on,
            exercise: "ベンチプレス",
            read: true,
            announced: true,
            mine: false,
          },
          {
            id: "stamp-praise-b",
            workout_id: record.id,
            group_id: state.group.id,
            group_name: state.group.name,
            sender_id: "member-b",
            display_name: "ユウ",
            kind: "praise",
            created_at: "2026-01-02T01:01:00Z",
            performed_on: record.performed_on,
            exercise: "ベンチプレス",
            read: true,
            announced: true,
            mine: false,
          },
        ],
        total: 2,
        people: 2,
        unread: 0,
        mine: [],
        can_send: true,
        has_more: false,
      },
    }),
  );
  await page.route(`**${path}`, (route) => {
    reads++;
    return fail
      ? route.fulfill({ status: 404, json: { detail: "記録を閲覧できません" } })
      : route.fulfill({ json: record });
  });
  await page.reload();
  const card = page.locator(".feed-item").filter({ hasText: "友達A" });
  await expect(card).toBeVisible();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(card).toContainText("2026年1月2日");
  await expect(card.locator(".record-set")).toHaveCount(22);
  await expect(card.locator(".record-details")).toContainText("ベンチプレス");
  await expect(card.locator(".record-details")).toContainText("スクワット");
  const details = card.locator(".record-details");
  await expect(details).toHaveClass(/is-collapsed/);
  expect(await details.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  const reveal = card.getByRole("button", { name: "友達Aの全セットを表示" });
  await expect(reveal).toBeVisible();
  const cardBox = await card.locator(".record-review").boundingBox();
  const fadeBox = await reveal.boundingBox();
  expect(Math.abs((fadeBox?.x ?? 0) - (cardBox?.x ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.abs((fadeBox?.width ?? 0) - (cardBox?.width ?? 0))).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      (fadeBox?.y ?? 0) + (fadeBox?.height ?? 0) - ((cardBox?.y ?? 0) + (cardBox?.height ?? 0)),
    ),
  ).toBeLessThanOrEqual(2);
  await details.getByRole("heading", { name: "ベンチプレス", exact: true }).click();
  await expect(details).not.toHaveClass(/is-collapsed/);
  await expect(card.getByRole("button", { name: "友達Aの記録を小さく表示" })).toBeAttached();
  await details.getByRole("heading", { name: "ベンチプレス", exact: true }).click();
  await expect(details).toHaveClass(/is-collapsed/);
  await reveal.click();
  await expect(details).not.toHaveClass(/is-collapsed/);
  await expect(card.getByRole("button", { name: /^(編集|削除|コピー|メモ)$/ })).toHaveCount(0);
  await expect(card.locator(".inline-stamp-choice")).toHaveCount(6);
  await card.getByRole("button", { name: "友達Aのリアクションの詳細", exact: true }).click();
  const stampDetails = page.getByRole("dialog", { name: "スタンプ", exact: true });
  await expect(stampDetails.locator(".stamp-reaction-row")).toHaveCount(1);
  await expect(stampDetails.locator(".stamp-reaction-row").getByRole("img")).toHaveCount(2);
  await stampDetails.getByRole("button", { name: "閉じる", exact: true }).click();
  const before = reads;
  fail = true;
  await page.reload();
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(card.locator(".record-set")).toHaveCount(0);
  await expect(card).toContainText("スクワット");
  fail = false;
  await page.reload();
  await expect.poll(() => reads).toBeGreaterThan(before + 1);
  await expect(card.locator(".record-set")).toHaveCount(22);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/shared-workout-detail.png", fullPage: true });
  await navigate(page, "設定");
});

test("非表示中と画面移動後は共有記録を取得せず本人メモも出さない", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.saves).toBe(1);
  await navigate(page, "ホーム");
  const record = state.session;
  if (!record) throw new Error("テスト記録が作成されていない");
  let reads = 0;
  await page.route(`**/api/groups/${state.group.id}/workouts/${record.id}`, (route) => {
    reads++;
    return route.fulfill({ json: record });
  });
  const card = page.locator(".feed-item").filter({ hasText: "画面テスト" });
  await expect(card.locator(".record-set")).toHaveCount(1);
  await expect(card.getByRole("button", { name: /^(編集|削除|コピー|メモ)$/ })).toHaveCount(0);
  await expect.poll(() => reads).toBeGreaterThan(0);
  const before = reads;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(10_000);
  expect(reads).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(5000);
  expect(reads).toBe(before);
  await navigate(page, "設定");
  const inactive = reads;
  await page.clock.runFor(10_000);
  expect(reads).toBe(inactive);
});
