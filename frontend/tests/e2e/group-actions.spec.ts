import { expect, test } from "./fixtures";
import { mockTraining, navigate } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}px: グループ管理ピルを押しやすくし、隣の操作やカードと重ねない`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockTraining(page);
    await navigate(page, "グループ");
    const actions = page.locator(".group-management-actions .group-action-pill");
    await expect(actions).toHaveCount(2);
    const create = await actions.nth(0).boundingBox();
    const join = await actions.nth(1).boundingBox();
    const card = await page.locator(".group-card-list .community-card").first().boundingBox();
    if (!create || !join || !card) throw new Error("グループ一覧の配置を取得できません");
    expect(create.width).toBeGreaterThanOrEqual(48);
    expect(create.height).toBeGreaterThanOrEqual(48);
    expect(join.width).toBeGreaterThanOrEqual(48);
    expect(join.height).toBeGreaterThanOrEqual(48);
    expect(create.x + create.width).toBeLessThanOrEqual(join.x);
    expect(Math.max(create.y + create.height, join.y + join.height)).toBeLessThanOrEqual(card.y);

    await page.locator(".group-card-list .community-card").first().click();
    const invite = page.getByRole("button", { name: "＋ 招待", exact: true });
    await expect(invite).toBeVisible();
    const inviteBox = await invite.boundingBox();
    if (!inviteBox) throw new Error("招待操作の配置を取得できません");
    expect(inviteBox.width).toBeGreaterThanOrEqual(48);
    expect(inviteBox.height).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
