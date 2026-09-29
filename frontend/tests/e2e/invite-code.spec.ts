import { expect, test } from "@playwright/test";
import { mockTraining, openGroup } from "./mock-training";

test("招待リンクの発行に失敗しても再試行でき、QRと同じリンクを共有できる", async ({ page }) => {
  const state = await mockTraining(page);
  let requests = 0;
  await page.route(`**/api/groups/${state.group.id}/invites`, (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 503, json: { detail: "発行できませんでした" } })
      : route.fulfill({
          json: { token: "new-invite-token", expires_at: "2026-10-04T00:00:00Z" },
        });
  });
  await openGroup(page, "invite");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("発行できませんでした");
  await expect(page.getByRole("button", { name: "リンクを共有" })).toBeDisabled();
  await page.getByRole("main").getByRole("button", { name: "再発行" }).click();
  await expect(
    page.getByRole("img", { name: `${state.group.name}への招待QRコード` }),
  ).toBeVisible();
  await expect(page.locator(".group-invite-expiry")).toContainText("10/4まで");
  await expect(page.getByRole("button", { name: "リンクを共有" })).toBeEnabled();
  expect(requests).toBe(2);
});

test("通常メンバーも7日間使える招待リンクを発行して共有できる", async ({ page }) => {
  const state = await mockTraining(page, false);
  let requests = 0;
  await page.route(`**/api/groups/${state.group.id}/invites`, (route) => {
    requests++;
    return route.fulfill({
      json: { token: "member-invite-token", expires_at: "2026-10-04T00:00:00Z" },
    });
  });
  await openGroup(page, "invite");
  await expect(
    page.getByRole("img", { name: `${state.group.name}への招待QRコード` }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "リンクを共有" })).toBeEnabled();
  expect(requests).toBe(1);
});
