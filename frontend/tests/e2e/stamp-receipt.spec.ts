import { expect, test } from "./fixtures";
import { mockTraining, startTraining } from "./mock-training";

test("終了結果の受信スタンプは6種類・未読・既読・取得失敗の再試行を確認できる", async ({
  page,
}) => {
  await mockTraining(page);
  const received = true;
  let read = false;
  let failed = false;
  const kinds = ["encourage", "push", "bad", "amazing", "praise", "tengu"];
  await page.route("**/api/stamps/inbox?*", (route) => {
    if (failed) return route.fulfill({ status: 503, json: { detail: "取得できません" } });
    return route.fulfill({
      json: {
        counts: received ? { encourage: 55, push: 2, bad: 1, amazing: 3, praise: 4, tengu: 1 } : {},
        total: received ? 66 : 0,
        people: received ? 55 : 0,
        unread: received && !read ? 6 : 0,
        can_send: false,
        mine: [],
        has_more: false,
        items: received
          ? kinds.map((kind, i) => ({
              id: `reaction-${i}`,
              workout_id: "workout",
              group_id: "group",
              group_name: "朝トレ部",
              sender_id: `sender-${i}`,
              display_name: `仲間${i + 1}`,
              kind,
              read,
              announced: false,
              performed_on: "2026-09-18",
              exercise: "ベンチプレス",
            }))
          : [],
      },
    });
  });
  await page.route("**/api/stamps/seen", (route) => {
    if (route.request().postDataJSON().read) read = true;
    return route.fulfill({ status: 204 });
  });

  await startTraining(page);
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await page.getByRole("button", { name: "終了する", exact: true }).click();
  const result = page.getByRole("region", { name: "トレーニング結果", exact: true });
  const receipt = result.getByRole("region", { name: "今回届いたスタンプ", exact: true });
  await expect(receipt.locator(".stamp-live-list button")).toHaveCount(6);
  const more = receipt.getByRole("button", { name: /届いたスタンプの詳細/ });
  await expect(more).toHaveAccessibleName("届いたスタンプの詳細・未読6件");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(more).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await more.click();
  const inbox = page.getByRole("dialog", { name: "今回届いたスタンプ", exact: true });
  await expect(inbox).toContainText("仲間1");
  await expect(inbox).toContainText("朝トレ部");
  await expect.poll(() => read).toBe(true);
  await inbox.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(more).toHaveAccessibleName("届いたスタンプの詳細");
  failed = true;
  await more.click();
  await inbox.getByRole("button", { name: "閉じる", exact: true }).click();
  const retry = receipt.getByRole("button", { name: "スタンプ取得を再試行", exact: true });
  await expect(retry).toBeVisible();
  failed = false;
  await retry.click();
  await expect(receipt.locator(".stamp-live-list button")).toHaveCount(6);
});
