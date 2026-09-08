import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("12桁コードで確認してから参加し、無効コードは再入力できる", async ({ page }) => {
  const state = await mockTraining(page);
  let joins = 0;
  await page.route("**/api/groups/preview", (route) =>
    route.fulfill(
      route.request().postDataJSON().invite_code === "ABCDEF123456"
        ? { json: { ...state.group, member_count: 3, already_member: false } }
        : { status: 404, json: { detail: "コードを確認してください" } },
    ),
  );
  await page.route("**/api/groups/join", (route) => {
    joins++;
    return route.fulfill({ json: state.group });
  });
  await page.getByRole("button", { name: "グループ一覧", exact: true }).click();
  await page.getByRole("button", { name: "招待コードで参加", exact: true }).click();
  await page.getByLabel("招待コード", { exact: true }).fill("000000000000");
  await page.getByRole("button", { name: "グループを確認", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText(
    "コードを確認してください",
  );
  await page.getByLabel("招待コード", { exact: true }).fill("abcdef123456");
  await page.getByRole("button", { name: "グループを確認", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("メンバー 3人");
  expect(joins).toBe(0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  expect(joins).toBe(0);
  await page.getByRole("button", { name: "グループを確認", exact: true }).click();
  await page.getByRole("button", { name: "参加する", exact: true }).click();
  await expect(page.getByRole("heading", { name: state.group.name, exact: true })).toBeVisible();
  expect(joins).toBe(1);
});

test("作成後は新グループの招待コードを表示する", async ({ page }) => {
  const state = await mockTraining(page);
  let created = false;
  const group = {
    ...state.group,
    id: "new-group",
    name: "新しい合トレ部",
    invite_code: "123456ABCDEF",
  };
  await page.route("**/api/groups", (route) => {
    if (route.request().method() === "POST") {
      created = true;
      return route.fulfill({ status: 201, json: group });
    }
    return route.fulfill({ json: created ? [state.group, group] : [state.group] });
  });
  await page.route("**/api/groups/new-group", (route) =>
    route.fulfill({ json: { ...group, members: [] } }),
  );
  await page.getByRole("button", { name: "グループ一覧", exact: true }).click();
  await page.getByRole("button", { name: "グループを作成", exact: true }).click();
  await page.getByLabel("グループ名", { exact: true }).fill(group.name);
  await page.getByRole("button", { name: "作成する", exact: true }).click();
  await expect(page.getByRole("heading", { name: group.name, exact: true })).toBeVisible();
  await expect(page.getByTestId("invite-code")).toHaveText(group.invite_code);
});

test("グループ切替中は前の共有記録を隠し、戻ったとき選択を保持する", async ({ page }) => {
  const state = await mockTraining(page);
  const second = { ...state.group, id: "second", name: "大学トレ部" };
  await page.route("**/api/groups", (route) => route.fulfill({ json: [state.group, second] }));
  const activity = {
    group_id: state.group.id,
    member_count: 3,
    live_count: 1,
    today_count: 2,
    members: [{ id: state.user.id, display_name: "画面テスト", live: true, today: true }],
    feed: [
      {
        workout_id: "record",
        user_id: state.user.id,
        display_name: "画面テスト",
        exercise: "最初のグループだけの記録",
        weight: 80,
        reps: 8,
        estimated_rm: 101.3,
        updated_at: new Date().toISOString(),
        best: true,
      },
    ],
  };
  await page.route(`**/api/groups/${state.group.id}/activity`, (route) =>
    route.fulfill({ json: activity }),
  );
  let fail = false;
  await page.route("**/api/groups/second/activity", (route) =>
    route.fulfill(
      fail
        ? { status: 403, json: { detail: "閲覧できません" } }
        : { json: { ...activity, group_id: second.id, feed: [] } },
    ),
  );
  await page.reload();
  await expect(page.getByRole("article")).toContainText("最初のグループだけの記録");
  await page.getByRole("button", { name: "大学トレ部を表示", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await navigate(page, "設定");
  await navigate(page, "ホーム");
  await expect(page.getByRole("button", { name: "大学トレ部を表示", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("article")).toHaveCount(0);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/v2-home-${width}.png`, fullPage: true });
  }
  fail = true;
  await navigate(page, "設定");
  await navigate(page, "ホーム");
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("閲覧できません");
});

test("ブラウザの戻るでシート・グループ詳細を閉じ、記録入力は維持する", async ({ page }) => {
  await mockTraining(page);
  await navigate(page, "設定");
  await page.getByRole("button", { name: /^外観/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /の詳細$/ }).click();
  await page.getByRole("button", { name: /^メンバーを招待/ }).click();
  await expect(page.getByTestId("invite-code")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: /^メンバー一覧/ })).toBeVisible();
});
