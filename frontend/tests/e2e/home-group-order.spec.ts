import { expect, test } from "./fixtures";
import { emptyTodayActivity, mockTraining } from "./mock-training";

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
    const group = groups.find(
      (item) => path === `/api/groups/${item.id}` || path === `/api/groups/${item.id}/activity`,
    );
    if (group)
      return route.fulfill({
        json: path.endsWith("/activity")
          ? {
              group_id: group.id,
              members: [],
              member_count: 1,
              live_count: 0,
              today_count: 0,
              feed: [],
            }
          : { ...group, members: [] },
      });
    return route.fallback();
  });
  await page.reload();
  await expect(page.locator(".group-carousel .community-card")).toHaveCount(3);
  return { state, groups };
}

async function hold(page: import("@playwright/test").Page, groupName: string) {
  const card = page.getByRole("button", { name: `${groupName}の詳細`, exact: true });
  const box = await card.boundingBox();
  if (!box) throw new Error("グループカードがありません");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator(".group-carousel .is-dragging")).toHaveCount(1);
  return box;
}

test("ホームカードの通常スワイプは選択だけを変え、表示順は変えない", async ({ page }) => {
  await setup(page);
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator(".group-carousel").boundingBox();
  if (!box) throw new Error("カードがありません");
  const y = box.y + 100;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 300, y }],
  });
  for (const x of [260, 220, 180, 140, 100, 60])
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByRole("button", { name: "朝トレ部を表示" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".group-carousel h2")).toHaveText([
    "画面テスト部",
    "朝トレ部",
    "週末トレ部",
  ]);
});

test("ホームカードの表示順保存に失敗しても元へ戻り、再試行できる", async ({ page }) => {
  const { state } = await setup(page);
  const key = `gotore:group-order:${state.user.id}`;
  const card = page.getByRole("button", { name: "画面テスト部の詳細", exact: true });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("gotore:group-order:"))
        throw new DOMException("full", "QuotaExceededError");
      original.call(this, key, value);
    };
    Object.assign(window, {
      restoreGroupStorage: () => {
        Storage.prototype.setItem = original;
      },
    });
  });
  async function dragRight() {
    const box = await hold(page, "画面テスト部");
    await page.mouse.move(375, box.y + 100, { steps: 8 });
    await expect(page.locator("output.sr-only")).toContainText("2番目");
    await page.mouse.up();
  }
  await dragRight();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText(
    "表示順を保存できませんでした",
  );
  await expect(page.locator(".group-carousel h2")).toHaveText([
    "画面テスト部",
    "朝トレ部",
    "週末トレ部",
  ]);
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
  await page.evaluate(() =>
    (window as unknown as { restoreGroupStorage: () => void }).restoreGroupStorage(),
  );
  await dragRight();
  await expect(page.locator(".group-carousel h2")).toHaveText([
    "朝トレ部",
    "画面テスト部",
    "週末トレ部",
  ]);
});

for (const width of [320, 390, 430]) {
  test(`${width}px: ホームのスワイプカード順を保ち、詳細タップと長押し移動を分ける`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const { state, groups } = await setup(page);
    const box = await hold(page, groups[0].name);
    await page.mouse.move(width - 12, box.y + 100, { steps: 8 });
    await expect(page.locator("output.sr-only")).toContainText("2番目");
    await page.mouse.up();
    await expect(page.locator(".group-carousel h2")).toHaveText([
      groups[1].name,
      groups[0].name,
      groups[2].name,
    ]);
    await expect(page.getByRole("button", { name: `${groups[0].name}を表示` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect
      .poll(() =>
        page.evaluate(
          (userId) => JSON.parse(localStorage.getItem(`gotore:group-order:${userId}`) ?? "[]")[0],
          state.user.id,
        ),
      )
      .toBe(groups[1].id);
    await page.reload();
    await expect(page.locator(".group-carousel h2")).toHaveText([
      groups[1].name,
      groups[0].name,
      groups[2].name,
    ]);
  });
}
