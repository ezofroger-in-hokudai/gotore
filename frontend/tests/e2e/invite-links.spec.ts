import { expect, test } from "./fixtures";
import { mockTraining, openGroup } from "./mock-training";

for (const owner of [true, false]) {
  test(`${owner ? "オーナー" : "メンバー"}は招待の発行失敗を再試行し、QRとリンクを共有できる`, async ({
    page,
  }) => {
    const state = await mockTraining(page, owner);
    let failed = true;
    let writes = 0;
    await page.route(`**/api/groups/${state.group.id}/invites`, (route) => {
      writes++;
      expect(route.request().method()).toBe("POST");
      return route.fulfill({
        status: failed ? 503 : 201,
        json: failed
          ? { detail: "招待を作成できません" }
          : {
              token: "current-invite-token",
              expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            },
      });
    });
    await page.evaluate(() =>
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: { url: string }) => {
          (window as unknown as { sharedUrl: string }).sharedUrl = data.url;
        },
      }),
    );
    await openGroup(page, "invite");
    const share = page.getByRole("button", { name: "リンクを共有", exact: true });
    await expect(page.getByRole("alert").filter({ hasText: "招待を作成できません" })).toBeVisible();
    await expect(share).toBeDisabled();
    expect(writes).toBe(1);
    failed = false;
    await page.getByRole("button", { name: "再発行", exact: true }).click();
    await expect(
      page.getByRole("img", { name: `${state.group.name}への招待QRコード`, exact: true }),
    ).toBeVisible();
    await expect(share).toBeEnabled();
    expect(writes).toBe(2);
    await share.click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { sharedUrl: string }).sharedUrl))
      .toContain("groupInvite=current-invite-token");
    await page.getByRole("button", { name: "完了", exact: true }).click();
    await expect(
      page.getByRole("img", { name: `${state.group.name}への招待QRコード`, exact: true }),
    ).toHaveCount(0);
  });
}
