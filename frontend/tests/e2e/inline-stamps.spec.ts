import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("一覧・詳細で共有するスタンプと、画面を閉じても続く送信・失敗の再試行", async ({ page }) => {
  const state = await mockTraining(page);
  const record = {
    id: "shared-record",
    user_id: "friend",
    display_name: "ミオ",
    group_id: state.group.id,
    performed_on: "2026-09-18",
    created_at: "2026-09-18T01:00:00Z",
    revision: 1,
    exercises: [
      {
        name: "ベンチプレス",
        sets: [
          { weight: 60, reps: 10 },
          { weight: 60, reps: 8 },
          { weight: 55, reps: 10 },
        ],
      },
    ],
  };
  const mine = new Set<string>();
  const gate: { release?: () => void } = {};
  const release = () => gate.release?.();
  let fail = false;
  let sentAt = 0;
  const summary = () => ({
    counts: {
      encourage: 3 + Number(mine.has("encourage")),
      praise: 2 + Number(mine.has("praise")),
      tengu: Number(mine.has("tengu")),
    },
    mine: [...mine],
    can_send: true,
  });
  await page.route(`**/api/groups/${state.group.id}/activity`, (route) =>
    route.fulfill({
      json: {
        group_id: state.group.id,
        member_count: 3,
        live_count: 1,
        today_count: 1,
        members: [
          {
            id: record.user_id,
            display_name: record.display_name,
            live: true,
            today: true,
          },
        ],
        feed: [
          {
            workout_id: record.id,
            user_id: record.user_id,
            display_name: record.display_name,
            exercise: "ベンチプレス",
            weight: 60,
            reps: 10,
            estimated_rm: 80,
            updated_at: new Date().toISOString(),
            best: false,
          },
        ],
      },
    }),
  );
  await page.route(`**/api/groups/${state.group.id}/workouts/${record.id}`, (route) =>
    route.fulfill({ json: record }),
  );
  await page.route("**/api/groups/*/stamps/summary", (route) =>
    route.fulfill({ json: { [record.id]: summary() } }),
  );
  await page.route("**/api/groups/*/workouts/*/stamps?*", (route) =>
    route.fulfill({
      json: {
        ...summary(),
        items: [{ id: "reaction", display_name: "タクミ", mine: false, kind: "encourage" }],
        total: 5,
        has_more: false,
      },
    }),
  );
  await page.route("**/api/groups/*/workouts/*/stamps/*", async (route) => {
    sentAt = Date.now();
    await new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    if (fail) return route.fulfill({ status: 503, json: { detail: "通信できません" } });
    const kind = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
    if (route.request().method() === "PUT") mine.add(kind);
    else mine.delete(kind);
    return route.fulfill({ json: {} });
  });
  await page.reload();
  const card = page.locator(".feed-item").filter({ hasText: "ミオ" });
  await expect(card.locator(".inline-stamp-choice")).toHaveCount(6);
  await expect(card.getByRole("button", { name: "💪スタンプ", exact: true })).toBeVisible();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/inline-stamps-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const date = await card.locator(".record-heading time").boundingBox();
  const author = await card.locator(".record-author").boundingBox();
  expect((date?.y ?? Number.POSITIVE_INFINITY) < (author?.y ?? 0)).toBe(true);
  await card.getByRole("button", { name: "👺スタンプ", exact: true }).click();
  await expect(card.getByRole("button", { name: "👺スタンプ", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(card).toHaveCSS("box-shadow", "none");
  await navigate(page, "設定");
  await page.waitForTimeout(Math.max(0, 10000 - (Date.now() - sentAt)));
  fail = true;
  release();
  await expect(page.getByRole("button", { name: /スタンプの未送信を確認/ })).toBeVisible();
  await page.getByRole("button", { name: /スタンプの未送信を確認/ }).click();
  const outbox = page.getByRole("dialog", { name: "スタンプの送信待ち" });
  await expect(outbox).toContainText("ミオ");
  await page.screenshot({ path: "test-results/inline-stamps-failure.png", fullPage: true });
  fail = false;
  gate.release = undefined;
  await outbox.getByRole("button", { name: "再試行", exact: true }).click();
  await expect.poll(() => !!gate.release).toBe(true);
  release();
  await expect(outbox).toContainText("送信待ちはありません");
  await outbox.getByRole("button", { name: "閉じる", exact: true }).click();
  await navigate(page, "ホーム");
  await expect(card.getByRole("button", { name: "👺スタンプ", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await card.getByRole("button", { name: "ミオのリアクションの詳細" }).click();
  const people = page.getByRole("dialog", { name: "スタンプ", exact: true });
  await expect(people.getByRole("region", { name: "💪スタンプ タクミ" })).toBeVisible();
  await page.screenshot({ path: "test-results/inline-stamps-people.png", fullPage: true });
  await people.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.screenshot({ path: "test-results/inline-stamps-dark.png", fullPage: true });
});
