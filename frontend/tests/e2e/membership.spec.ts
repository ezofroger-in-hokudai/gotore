import { expect, test } from "./fixtures";
import { mockTraining, navigate, openTraining, startTraining } from "./mock-training";

for (const owner of [true, false]) {
  test(owner
    ? "オーナーは設定からメンバーを退出させる"
    : "本人は設定からグループを抜けられる", async ({ page }) => {
    const { user, group } = await mockTraining(page, owner);
    const other = {
      id: "00000000-0000-0000-0000-000000000004",
      display_name: "合トレ仲間",
      joined_at: "2026-01-02T00:00:00Z",
      last_activity_at: "2026-09-27T01:00:00Z",
    };
    const self = {
      id: user.id,
      display_name: "画面テスト",
      joined_at: "2026-01-01T00:00:00Z",
      last_activity_at: "2026-09-26T01:00:00Z",
    };
    let ended = false;
    let fail = true;
    let attempts = 0;
    await page.route("**/api/groups**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === "DELETE") {
        attempts++;
        expect(path).toBe(
          owner
            ? `/api/groups/${group.id}/members/${other.id}`
            : `/api/groups/${group.id}/membership`,
        );
        expect(new URL(request.url()).searchParams.get("expected_joined_at")).toBe(
          owner ? other.joined_at : self.joined_at,
        );
        if (fail) return route.abort();
        ended = true;
        return route.fulfill({ status: 204 });
      }
      if (path === "/api/groups") return route.fulfill({ json: ended && !owner ? [] : [group] });
      if (path === `/api/groups/${group.id}`)
        return route.fulfill({ json: { ...group, members: ended ? [self] : [self, other] } });
      return route.fallback();
    });
    if (!owner) await startTraining(page, "スクワット");
    await navigate(page, "グループ");
    await page.locator(".group-card-list .community-card").first().click();
    await page
      .getByRole("navigation", { name: "グループの表示" })
      .getByRole("button", { name: "設定", exact: true })
      .click();
    if (owner) {
      await page.getByRole("button", { name: "合トレ仲間の設定", exact: true }).click();
      await page.getByRole("button", { name: "退出させる", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "メンバーを退出させる" })).toBeVisible();
      await page.getByRole("button", { name: "退出させる", exact: true }).last().click();
      await expect(page.locator(".v2-app").getByRole("alert")).toBeVisible();
      fail = false;
      await page
        .getByRole("dialog", { name: "メンバーを退出させる" })
        .getByRole("button", { name: "退出させる", exact: true })
        .click();
      await expect(page.locator(".group-member-row")).toHaveCount(1);
    } else {
      await page.getByRole("button", { name: "グループから抜ける", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "グループから抜ける" })).toContainText(
        group.name,
      );
      await page.getByRole("button", { name: "抜ける", exact: true }).click();
      await expect(page.locator(".v2-app").getByRole("alert")).toBeVisible();
      fail = false;
      await page.getByRole("button", { name: "抜ける", exact: true }).click();
      await expect(page.getByRole("heading", { name: "グループ", exact: true })).toBeVisible();
      await openTraining(page);
      await expect(page.getByRole("button", { name: "スクワット", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "セットを追加", exact: true })).toBeEnabled();
    }
    expect(attempts).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("展開したメンバーの三点メニューをタッチして操作を開ける", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    const { user, group } = await mockTraining(page);
    const members = Array.from({ length: 5 }, (_, index) => ({
      id: index === 0 ? user.id : `00000000-0000-0000-0000-00000000000${index + 2}`,
      display_name: index === 0 ? "画面テスト" : `仲間${index}`,
      joined_at: "2026-01-01T00:00:00Z",
      last_activity_at: `2026-09-${String(29 - index).padStart(2, "0")}T01:00:00Z`,
    }));
    await page.route(`**/api/groups/${group.id}`, (route) =>
      route.fulfill({ json: { ...group, members } }),
    );
    await navigate(page, "グループ");
    await page.locator(".group-card-list .community-card").first().click();
    await page
      .getByRole("navigation", { name: "グループの表示" })
      .getByRole("button", { name: "設定" })
      .click();
    await page.getByRole("button", { name: "メンバー一覧を展開" }).tap();
    await expect(page.locator(".group-members-card")).toHaveClass(/expanded/);
    await page.getByRole("button", { name: "仲間4の設定" }).tap();
    await expect(page.getByRole("dialog", { name: "仲間4" })).toBeVisible();
    await expect(page.locator(".group-members-card")).toHaveClass(/expanded/);
    await page.getByRole("dialog", { name: "仲間4" }).getByRole("button", { name: "閉じる" }).tap();
    await expect(page.getByRole("dialog", { name: "仲間4" })).toHaveCount(0);
    for (const verticalPosition of ["top", "middle", "bottom"] as const) {
      const card = page.locator(".group-members-card");
      const collapse = page.getByRole("button", { name: "メンバー一覧を閉じる" });
      const cardBounds = await card.boundingBox();
      const collapseBounds = await collapse.boundingBox();
      if (!cardBounds || !collapseBounds) throw new Error("メンバー一覧の位置を確認できません");
      expect(collapseBounds.height).toBeGreaterThanOrEqual(cardBounds.height - 2);
      const y =
        verticalPosition === "top"
          ? 20
          : verticalPosition === "middle"
            ? collapseBounds.height / 2
            : collapseBounds.height - 20;
      await collapse.tap({ position: { x: 20, y } });
      await expect(page.locator(".group-members-card")).toHaveClass(/collapsed/);
      if (verticalPosition !== "bottom") {
        await page.getByRole("button", { name: "メンバー一覧を展開" }).tap();
        await expect(page.locator(".group-members-card")).toHaveClass(/expanded/);
      }
    }
  } finally {
    await context.close();
  }
});
