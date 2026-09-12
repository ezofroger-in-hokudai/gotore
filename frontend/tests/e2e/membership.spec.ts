import { expect, test } from "@playwright/test";
import {
  mockTraining,
  navigate,
  openGroup,
  openRecord,
  openTraining,
  startTraining,
} from "./mock-training";

for (const owner of [true, false]) {
  test(owner
    ? "オーナーは対象者を確認して除外し、失敗時は再試行できる"
    : "本人が退出しても進行中の入力を失わず記録を続けられる", async ({ page }) => {
    const { user, group } = await mockTraining(page, owner);
    const other = {
      id: "00000000-0000-0000-0000-000000000004",
      display_name: "合トレ仲間",
      joined_at: "2026-01-01T00:00:00Z",
    };
    const self = { id: user.id, display_name: "画面テスト", joined_at: "2026-01-01T00:00:00Z" };
    let ended = false;
    let fail = true;
    let attempts = 0;
    await page.route("**/api/groups**", (route) => {
      const request = route.request();
      if (request.method() === "DELETE") {
        attempts++;
        expect(new URL(request.url()).pathname).toBe(
          `/api/groups/${group.id}/${owner ? `members/${other.id}` : "membership"}`,
        );
        expect(new URL(request.url()).searchParams.get("expected_joined_at")).toBe(self.joined_at);
        if (fail) return route.abort();
        ended = true;
        return route.fulfill({ status: 204 });
      }
      if (new URL(request.url()).pathname === "/api/groups")
        return route.fulfill({ json: ended && !owner ? [] : [group] });
      if (
        ["/activity", "/analytics"].some((suffix) =>
          new URL(request.url()).pathname.endsWith(suffix),
        )
      )
        return route.fallback();
      if (new URL(request.url()).pathname.endsWith("/workouts")) return route.fulfill({ json: [] });
      return route.fulfill({ json: { ...group, members: ended ? [self] : [self, other] } });
    });
    if (!owner) await startTraining(page, "スクワット");
    await openGroup(page, "members");
    const action = page.getByRole("button", {
      name: owner ? "合トレ仲間を除外" : "退出",
      exact: true,
    });
    if (owner) await expect(page.getByRole("button", { name: "退出", exact: true })).toHaveCount(0);
    else
      await expect(page.getByRole("button", { name: "合トレ仲間を除外", exact: true })).toHaveCount(
        0,
      );
    await action.click();
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    expect(attempts).toBe(0);
    await action.click();
    await expect(page.locator(".membership-confirm")).toBeVisible();
    await page.locator(".membership-confirm").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/membership-${owner ? "remove" : "leave"}-mobile.png`,
    });
    const confirm = page.getByRole("button", {
      name: owner ? "除外する" : "退出する",
      exact: true,
    });
    await confirm.click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("通信できません");
    fail = false;
    await confirm.click();
    if (owner) {
      await expect(page.getByRole("button", { name: "合トレ仲間を除外", exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByRole("status").filter({ hasText: "除外しました" })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible();
      await openTraining(page);
      await expect(page.getByRole("heading", { name: "スクワット", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeEnabled();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
