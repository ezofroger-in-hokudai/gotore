import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

test("友達のセットから選んだ記録の全種目・全セットを開き、戻って再取得する", async ({ page }) => {
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
      {
        name: "ベンチプレス",
        sets: [
          { weight: 80, reps: 8 },
          { weight: 75, reps: 10 },
        ],
      },
      { name: "スクワット", sets: [{ weight: 100, reps: 5 }] },
    ],
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
  const open = page.getByRole("button", { name: "友達Aの記録詳細を開く", exact: true });
  await expect(open).toBeVisible();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await open.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("2026年1月2日");
  await expect(dialog.locator(".record-set")).toHaveCount(3);
  await expect(dialog.locator(".record-details")).toContainText("ベンチプレス");
  await expect(dialog.locator(".record-details")).toContainText("スクワット");
  await expect(dialog.getByRole("button", { name: /^(編集|削除|コピー|メモ)$/ })).toHaveCount(0);
  const addStamp = dialog.getByRole("button", { name: "友達Aの記録にスタンプを追加", exact: true });
  await expect(addStamp).toBeEnabled();
  await addStamp.click();
  const picker = page.getByRole("dialog", { name: "スタンプ", exact: true });
  await expect(picker.getByRole("button", { name: "えらい", exact: true })).toBeEnabled();
  await picker.getByRole("button", { name: "えらい", exact: true }).click();
  await expect(picker.getByRole("button", { name: "えらい", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await picker.getByRole("button", { name: "閉じる", exact: true }).click();
  await dialog.getByRole("button", { name: "友達Aのリアクションの詳細", exact: true }).click();
  const stampDetails = page.getByRole("dialog", { name: "スタンプ", exact: true });
  await expect(stampDetails.locator(".stamp-reaction-row")).toHaveCount(1);
  await expect(stampDetails.locator(".stamp-reaction-row").getByRole("img")).toHaveCount(2);
  await stampDetails.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeVisible();
  const before = reads;
  fail = true;
  await open.click();
  await expect(dialog.getByRole("alert")).toContainText("記録を閲覧できません");
  await expect(dialog.locator(".record-set")).toHaveCount(0);
  expect(reads).toBeGreaterThan(before);
  fail = false;
  await dialog.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(dialog.locator(".record-set")).toHaveCount(3);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await expect(dialog.getByRole("button", { name: "閉じる", exact: true })).toBeInViewport();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/shared-workout-detail.png", fullPage: true });
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await navigate(page, "設定");
});

test("詳細の共有権限を再確認し、非表示中と閉じた後は取得せず本人メモも出さない", async ({
  page,
}) => {
  await page.clock.install();
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.saves).toBe(1);
  await navigate(page, "ホーム");
  const record = state.session;
  if (!record) throw new Error("テスト記録が作成されていない");
  let reads = 0;
  let fail = false;
  await page.route(`**/api/groups/${state.group.id}/workouts/${record.id}`, (route) => {
    reads++;
    return fail
      ? route.fulfill({ status: 404, json: { detail: "記録を閲覧できません" } })
      : route.fulfill({ json: record });
  });
  await page.getByRole("button", { name: /の記録詳細を開く$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".record-set")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /^(編集|削除|コピー|メモ)$/ })).toHaveCount(0);
  const before = reads;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(10_000);
  expect(reads).toBe(before);
  fail = true;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(dialog.getByRole("alert")).toContainText("記録を閲覧できません");
  await expect(dialog.locator(".record-set")).toHaveCount(0);
  fail = false;
  await page.clock.runFor(5000);
  await expect(dialog.locator(".record-set")).toHaveCount(1);
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  const closed = reads;
  await page.clock.runFor(10_000);
  expect(reads).toBe(closed);
});
