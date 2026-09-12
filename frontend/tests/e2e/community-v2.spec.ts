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
    return route.fulfill({
      json: created ? [state.group, group] : [state.group],
    });
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
  expect(await page.evaluate(() => history.state.groupId)).toBe(group.id);
  await page.goBack();
  await page.goForward();
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
    members: [
      {
        id: state.user.id,
        display_name: "画面テスト",
        live: true,
        today: true,
      },
    ],
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
  await page.route("**/api/groups/activity/summary", (route) => {
    const { feed, ...summary } = activity;
    return route.fulfill({ json: [summary, { ...summary, group_id: second.id }] });
  });
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
    await page.screenshot({
      path: `test-results/v2-home-${width}.png`,
      fullPage: true,
    });
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

test("一覧で選んだグループを戻る・進むとメンバー・招待画面でも保持する", async ({ page }) => {
  const state = await mockTraining(page);
  const second = {
    ...state.group,
    id: "second",
    name: "大学トレ部",
    invite_code: "123456ABCDEF",
  };
  await page.route("**/api/groups", (route) => route.fulfill({ json: [state.group, second] }));
  await page.route("**/api/groups/second", (route) =>
    route.fulfill({ json: { ...second, members: [] } }),
  );
  await page.reload();
  await page.route("**/api/groups/second/activity", (route) =>
    route.fulfill({
      json: {
        group_id: second.id,
        member_count: 0,
        live_count: 0,
        today_count: 0,
        members: [],
        feed: [],
      },
    }),
  );
  const length = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: "大学トレ部を表示", exact: true }).click();
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.getByRole("button", { name: `${state.group.name}を表示`, exact: true }).click();
  await page.getByRole("button", { name: "グループ一覧", exact: true }).click();
  await page.getByRole("button", { name: "大学トレ部 ›", exact: true }).click();
  await expect(page.getByRole("heading", { name: second.name, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "グループ一覧", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: second.name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^メンバー一覧/ }).click();
  expect(await page.evaluate(() => history.state.groupId)).toBe(second.id);
  await page.goBack();
  await page.getByRole("button", { name: /^メンバーを招待/ }).click();
  await expect(page.getByTestId("invite-code")).toHaveText(second.invite_code);
  await page.goBack();
  await expect(page.getByRole("heading", { name: second.name, exact: true })).toBeVisible();
});

test("新しく参加したグループも戻る・進むで復元する", async ({ page }) => {
  const state = await mockTraining(page);
  const joined = { ...state.group, id: "joined", name: "参加先の部活" };
  let member = false;
  await page.route("**/api/groups/preview", (route) =>
    route.fulfill({
      json: { ...joined, member_count: 3, already_member: false },
    }),
  );
  await page.route("**/api/groups/join", (route) => {
    member = true;
    return route.fulfill({ json: joined });
  });
  await page.route("**/api/groups", (route) =>
    route.fulfill({ json: member ? [state.group, joined] : [state.group] }),
  );
  await page.route("**/api/groups/joined", (route) =>
    route.fulfill({ json: { ...joined, members: [] } }),
  );
  await page.getByRole("button", { name: "グループ一覧", exact: true }).click();
  await page.getByRole("button", { name: "招待コードで参加", exact: true }).click();
  await page.getByLabel("招待コード", { exact: true }).fill("ABCDEF123456");
  await page.getByRole("button", { name: "グループを確認", exact: true }).click();
  await page.getByRole("button", { name: "参加する", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: joined.name, level: 1, exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "招待コードで参加", exact: true })).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: joined.name, level: 1, exact: true }),
  ).toBeVisible();
});
