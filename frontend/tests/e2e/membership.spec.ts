import { expect, test } from "@playwright/test";
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
