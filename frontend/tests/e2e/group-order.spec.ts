import { expect, test } from "@playwright/test";
import { emptyTodayActivity, mockTraining, navigate } from "./mock-training";

async function setup(page: import("@playwright/test").Page) {
  const state = await mockTraining(page);
  const groups = [
    state.group,
    { ...state.group, id: "group-b", name: "朝トレ部" },
    { ...state.group, id: "group-c", name: "週末トレ部" },
  ];
  await page.route("**/api/groups**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/groups") return route.fulfill({ json: groups });
    if (path === "/api/groups/today-activity")
      return route.fulfill({ json: emptyTodayActivity(groups) });
    const group = groups.find((item) => path === `/api/groups/${item.id}`);
    if (group)
      return route.fulfill({
        json: {
          ...group,
          members: [
            {
              id: state.user.id,
              display_name: "画面テスト",
              joined_at: "2026-01-01T00:00:00Z",
              last_activity_at: null,
            },
            ...["ミオ", "ケン", "ユイ"].map((display_name, index) => ({
              id: `member-${index}`,
              display_name,
              joined_at: `2026-01-0${index + 2}T00:00:00Z`,
              last_activity_at: null,
            })),
          ],
        },
      });
    return route.fallback();
  });
  await page.reload();
  await navigate(page, "グループ");
  await expect(page.locator(".group-card-list .community-card")).toHaveCount(3);
  return { state, groups };
}

test("所属グループが1件の間は並べ替え案内を出さず、2件になると案内する", async ({ page }) => {
  const state = await mockTraining(page);
  const groups = [state.group];
  await page.route("**/api/groups**", (route) => {
    if (new URL(route.request().url()).pathname === "/api/groups/today-activity")
      return route.fulfill({ json: emptyTodayActivity(groups) });
    if (new URL(route.request().url()).pathname === "/api/groups")
      return route.fulfill({ json: groups });
    return route.fallback();
  });
  await page.reload();
  await navigate(page, "グループ");
  const cards = page.locator(".group-card-list .community-card");
  const hint = page.locator(".group-order-hint");
  await expect(cards).toHaveCount(1);
  await expect(hint).toHaveCount(0);

  groups.push({ ...state.group, id: "group-b", name: "朝トレ部" });
  await page.reload();
  await navigate(page, "グループ");
  await expect(cards).toHaveCount(2);
  await expect(hint).toHaveText("長押しドラッグで表示順を変更");

  groups.pop();
  await page.reload();
  await navigate(page, "グループ");
  await expect(cards).toHaveCount(1);
  await expect(hint).toHaveCount(0);
});

for (const width of [320, 390, 430]) {
  test(`${width}px: グループ一覧で長押しドラッグし、詳細タップと順序保存を分ける`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const { state, groups } = await setup(page);
    const key = `gotore:group-order:${state.user.id}`;
    const first = page.locator(".group-list-drag-wrap").nth(0);
    await first.locator(".community-card").hover();
    const box = await first.locator(".community-card").boundingBox();
    if (!box) throw new Error("グループカードがありません");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await expect(first.locator(".community-card")).toHaveClass(/is-dragging/);
    const targetBox = await page.locator(".group-list-drag-wrap").nth(1).boundingBox();
    if (!targetBox) throw new Error("移動先グループカードがありません");
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 150, {
      steps: 8,
    });
    await expect(first.locator(".community-card")).toHaveClass(/is-dragging/);
    await expect(first).toHaveClass(/is-dragging/);
    await expect.poll(async () => (await first.boundingBox())?.y ?? 0).toBeGreaterThan(box.y + 40);
    await expect
      .poll(async () => (await page.locator(".group-list-drag-wrap").nth(1).boundingBox())?.y ?? 0)
      .toBeLessThan(targetBox.y - 40);
    await page.mouse.up();
    await expect(page.locator(".group-card-list h2")).toHaveText([
      groups[1].name,
      groups[0].name,
      groups[2].name,
    ]);
    await expect
      .poll(() =>
        page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? "[]"), key),
      )
      .toEqual([groups[1].id, groups[0].id, groups[2].id]);

    await page.locator(".group-card-list .community-card").first().click();
    await expect(page.getByRole("heading", { name: groups[1].name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("グループ詳細の設定でメンバーを展開し、オーナー移譲の確認へ進める", async ({ page }) => {
  const { state } = await setup(page);
  await page.locator(".group-card-list .community-card").first().click();
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "設定", exact: true })
    .click();
  await page.getByRole("button", { name: "メンバー一覧を展開", exact: true }).click();
  await expect(page.locator(".group-member-row")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "グループから抜ける", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ミオの設定", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("オーナーにする");
  expect(state.group.owner_id).toBe(state.user.id);
});

test("オーナーは設定行でグループ名を直接編集して決定できる", async ({ page }) => {
  const { state, groups } = await setup(page);
  await page.route(`**/api/groups/${state.group.id}`, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    groups[0].name = route.request().postDataJSON().name;
    return route.fulfill({ json: groups[0] });
  });
  await page.locator(".group-card-list .community-card").first().click();
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "設定", exact: true })
    .click();
  await page.getByRole("button", { name: "グループ名を編集" }).click();
  const row = page.locator(".group-setting-row.is-editing");
  await expect(row).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row.getByRole("textbox", { name: "グループ名" }).fill("更新したグループ名");
  await row.getByRole("button", { name: "決定" }).click();
  await expect(page.locator(".group-setting-row")).toContainText("更新したグループ名");
  await expect(page.locator(".group-setting-row.is-editing")).toHaveCount(0);
});
