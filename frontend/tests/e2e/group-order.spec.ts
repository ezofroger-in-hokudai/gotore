import { type Locator, type Page, expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

async function setup(page: Page) {
  const state = await mockTraining(page);
  const groups = [
    state.group,
    { ...state.group, id: "group-b", name: "朝トレ部" },
    { ...state.group, id: "group-c", name: "週末トレ部" },
  ];
  const data = { groups };
  await page.route("**/api/groups**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/groups") return route.fulfill({ json: data.groups });
    if (path === "/api/groups/activity/summary") return route.fulfill({ json: [] });
    const group = data.groups.find(
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
  return { ...state, data, key: `gotore:group-order:${state.user.id}` };
}
async function hold(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("長押し対象がありません");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByRole("dialog", { name: "グループの並べ替え" })).toBeVisible();
  await page.mouse.up();
}
async function holdCard(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("カードがありません");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator(".group-carousel .is-dragging")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return box;
}
const names = ["画面テスト部", "朝トレ部", "週末トレ部"];
for (const width of [320, 390, 430]) {
  test(`${width}px: 長押しで並べ替え、選択を保ちホームと一覧・再読込に反映する`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const { key } = await setup(page);
    const box = await holdCard(
      page,
      page.getByRole("button", { name: "画面テスト部の詳細", exact: true }),
    );
    const sheet = page.getByRole("dialog");
    await page.mouse.move(width - 12, box.y + 100, { steps: 8 });
    await expect(page.locator("output.sr-only")).toContainText("2番目");
    await expect
      .poll(() => page.locator(".group-carousel").evaluate((element) => element.scrollLeft), {
        intervals: [16],
      })
      .toBeGreaterThan((box.width + 12) * 0.85);
    await page.mouse.move(width / 2, box.y + 100);
    await expect(page.locator("output.sr-only")).toContainText("2番目");
    await page.screenshot({ path: `test-results/group-drag-${width}.png`, fullPage: true });
    await page.mouse.up();
    await expect(page.locator(".group-carousel.is-reordering")).toHaveCount(0);
    await page.screenshot({ path: `test-results/group-order-${width}.png`, fullPage: true });
    await expect(page.locator(".group-carousel h2")).toHaveText([names[1], names[0], names[2]]);
    await expect(page.getByRole("button", { name: "画面テスト部を表示" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect
      .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]")[0], key))
      .toBe("group-b");
    await page.getByRole("button", { name: "グループ一覧", exact: true }).click();
    await expect(page.locator(".group-order-entry span:first-child")).toHaveText([
      names[1],
      names[0],
      names[2],
    ]);
    await hold(page, page.getByRole("button", { name: "朝トレ部 ›", exact: true }));
    await sheet.getByRole("button", { name: "朝トレ部を下へ", exact: true }).click();
    await page.goBack();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator(".group-order-entry span:first-child")).toHaveText([
      names[1],
      names[0],
      names[2],
    ]);
    await navigate(page, "ホーム");
    await page.reload();
    await expect(page.locator(".group-carousel h2")).toHaveText([names[1], names[0], names[2]]);
    await page.getByRole("button", { name: "朝トレ部の詳細", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "朝トレ部", level: 1, exact: true }),
    ).toBeVisible();
  });
}

test("ドラッグとキーボード移動、保存失敗後の再試行、所属増減を扱う", async ({ page }) => {
  const { key, data } = await setup(page);
  await page.getByRole("button", { name: "グループ一覧", exact: true }).click();
  await page.getByRole("button", { name: "並べ替え", exact: true }).click();
  const sheet = page.getByRole("dialog");
  const from = await sheet
    .getByRole("button", { name: "週末トレ部を移動", exact: true })
    .boundingBox();
  const to = await sheet
    .getByRole("button", { name: "画面テスト部を移動", exact: true })
    .boundingBox();
  if (!from || !to) throw new Error("移動先がありません");
  await page.mouse.move(from.x + 24, from.y + 24);
  await page.mouse.down();
  await page.mouse.move(to.x + 24, to.y + 24, { steps: 12 });
  await page.mouse.up();
  await expect(sheet.locator(".group-order-name")).toHaveText([names[2], names[0], names[1]]);
  await sheet.getByRole("button", { name: "朝トレ部を移動", exact: true }).press("ArrowUp");
  await expect(sheet.locator(".group-order-name")).toHaveText([names[2], names[1], names[0]]);
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
  await sheet.getByRole("button", { name: "完了", exact: true }).click();
  await expect(sheet.getByRole("alert")).toContainText("保存できませんでした");
  await page.evaluate(() =>
    (window as unknown as { restoreGroupStorage: () => void }).restoreGroupStorage(),
  );
  await sheet.getByRole("button", { name: "完了", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  data.groups = [
    data.groups[0],
    data.groups[2],
    { ...data.groups[0], id: "group-d", name: "新しい部" },
  ];
  await page.reload();
  await expect(page.locator(".group-carousel h2")).toHaveText([names[2], names[0], "新しい部"]);
  await page.evaluate((key) => {
    localStorage.setItem(`${key}-other`, '["group-c"]');
    localStorage.setItem(key, "broken");
  }, key);
  await page.reload();
  await expect(page.locator(".group-carousel h2")).toHaveText([names[0], names[2], "新しい部"]);
});

test("タッチの通常スワイプと長押し後のカード左右移動を区別する", async ({ page }) => {
  await setup(page);
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator(".group-carousel").boundingBox();
  if (!box) throw new Error("カードがありません");
  const y = box.y + 100;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 300, y }] });
  for (const x of [260, 220, 180, 140, 100, 60]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByRole("button", { name: "朝トレ部を表示" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".group-carousel h2")).toHaveText(names);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 160, y }] });
  await expect(page.locator(".group-carousel .is-dragging")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 25, y }] });
  await expect(page.locator("output.sr-only")).toContainText("1番目");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".group-carousel h2")).toHaveText([names[1], names[0], names[2]]);
  await expect(page.getByRole("button", { name: "朝トレ部を表示" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("別ユーザーの表示順を引き継がず、元の本人は再ログイン後も復元する", async ({ page }) => {
  const state = await setup(page);
  const originalId = state.user.id;
  await page.getByRole("button", { name: "グループ一覧", exact: true }).click();
  await page.getByRole("button", { name: "並べ替え", exact: true }).click();
  await page.getByRole("button", { name: "画面テスト部を下へ", exact: true }).click();
  await page.getByRole("button", { name: "完了", exact: true }).click();
  async function loginAs(id: string) {
    await navigate(page, "設定");
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
    state.user.id = id;
    await page.getByLabel("メールアドレス", { exact: true }).fill("next@example.test");
    await page.getByLabel("パスワード", { exact: true }).fill("ui-test-password");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
  }
  await loginAs("00000000-0000-0000-0000-000000000009");
  await expect(page.locator(".group-carousel h2")).toHaveText(names);
  await loginAs(originalId);
  await expect(page.locator(".group-carousel h2")).toHaveText([names[1], names[0], names[2]]);
});

test("長押しを閉じた後のキーボード操作と、未取得時の保存防止", async ({ page }) => {
  const { key } = await setup(page);
  const card = page.getByRole("button", { name: "画面テスト部の詳細", exact: true });
  await holdCard(page, card);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await card.press("Enter");
  await expect(
    page.getByRole("heading", { name: "画面テスト部", level: 1, exact: true }),
  ).toBeVisible();
  await navigate(page, "ホーム");
  await page.getByRole("button", { name: "グループ一覧", exact: true }).click();
  await page.getByRole("button", { name: "並べ替え", exact: true }).click();
  await page.route("**/api/groups", (route) =>
    route.fulfill({ status: 403, json: { detail: "アクセスできません" } }),
  );
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: "完了", exact: true })).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
});

test("カード移動の保存失敗は元の順序へ戻し、同じ操作で再試行できる", async ({ page }) => {
  const { key } = await setup(page);
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
    const box = await holdCard(page, card);
    await page.mouse.move(375, box.y + 100, { steps: 8 });
    await expect(page.locator("output.sr-only")).toContainText("2番目");
    await page.mouse.up();
  }
  await dragRight();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText(
    "表示順を保存できませんでした",
  );
  await expect(page.locator(".group-carousel h2")).toHaveText(names);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  await page.evaluate(() =>
    (window as unknown as { restoreGroupStorage: () => void }).restoreGroupStorage(),
  );
  await dragRight();
  await expect(page.locator(".group-carousel h2")).toHaveText([names[1], names[0], names[2]]);
  await expect(page.locator(".v2-app").getByRole("alert")).toHaveCount(0);
});
