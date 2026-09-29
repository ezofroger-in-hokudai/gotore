import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { mockTraining, navigate, openGroup } from "./mock-training";

const avatarPng = readFileSync(resolve(__dirname, "../fixtures/avatar.png"));

async function openGroupList(page: import("@playwright/test").Page) {
  await navigate(page, "グループ");
}

test("別タブからグループへ戻ると詳細を保持し、再タップでグループホームへ戻る", async ({ page }) => {
  const state = await mockTraining(page);
  await navigate(page, "グループ");
  await expect(page.getByRole("heading", { name: "グループ", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: state.group.name, level: 1, exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => history.state.communityMode)).toBe("list");

  await page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: state.group.name, level: 2, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "カレンダー", exact: true })
    .click();
  await navigate(page, "履歴");
  await navigate(page, "グループ");
  await expect(
    page.getByRole("heading", { name: state.group.name, level: 2, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "グループの表示" })
      .getByRole("button", { name: "カレンダー", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => history.state.communityMode)).toBe("detail");

  await navigate(page, "グループ");
  await expect(page.getByRole("heading", { name: "グループ", exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.state.communityMode)).toBe("list");
});

test("グループ詳細の取得中は失敗表示を出さず、取得後に記録の空状態を表示する", async ({ page }) => {
  const state = await mockTraining(page);
  let releaseDetail: () => void = () => {};
  let releaseActivity: () => void = () => {};
  const detailPending = new Promise<void>((resolve) => {
    releaseDetail = resolve;
  });
  const activityPending = new Promise<void>((resolve) => {
    releaseActivity = resolve;
  });
  await page.route(`**/api/groups/${state.group.id}`, async (route) => {
    await detailPending;
    await route.fallback();
  });
  await page.route(`**/api/groups/${state.group.id}/activity`, async (route) => {
    await activityPending;
    await route.fulfill({
      json: {
        group_id: state.group.id,
        member_count: 1,
        live_count: 0,
        today_count: 0,
        members: [],
        feed: [],
      },
    });
  });
  try {
    await openGroupList(page);
    await page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true }).click();
    await expect(page.locator('output[aria-label="グループ情報を読み込み中"]')).toBeVisible();
    await expect(page.getByText("グループ情報を読み込めません")).toHaveCount(0);

    releaseDetail();
    await expect(page.getByRole("navigation", { name: "グループの表示" })).toBeVisible();
    await expect(page.locator('output[aria-label="グループの記録を読み込み中"]')).toBeVisible();
    await expect(page.getByText("記録を読み込めません")).toHaveCount(0);

    releaseActivity();
    await expect(page.locator(".feed-empty").last()).toBeVisible();
  } finally {
    releaseDetail();
    releaseActivity();
  }
});

test("グループ詳細と設定のメンバーに保存済み画像を表示する", async ({ page }) => {
  const state = await mockTraining(page);
  await page.route(`**/api/groups/${state.group.id}`, (route) =>
    route.fulfill({
      json: {
        ...state.group,
        members: [
          {
            id: state.user.id,
            display_name: "画面テスト",
            avatar_version: "group-photo",
            joined_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    }),
  );
  await page.route(`**/api/profiles/${state.user.id}/avatar`, (route) =>
    route.fulfill({
      json: {
        version: "group-photo",
        data_url: `data:image/png;base64,${avatarPng.toString("base64")}`,
      },
    }),
  );
  await navigate(page, "グループ");
  await page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true }).click();
  await expect(page.locator(".member-avatars-strip img")).toBeVisible();
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "設定" })
    .click();
  await expect(page.locator(".group-settings .group-member-row img")).toBeVisible();
});

test("招待リンクを確認してから参加する", async ({ page }) => {
  const state = await mockTraining(page);
  let joins = 0;
  await page.route("**/api/group-invites/preview", (route) =>
    route.fulfill(
      route.request().postDataJSON().token === "valid-token"
        ? {
            json: {
              id: state.group.id,
              name: state.group.name,
              member_count: 5,
              already_member: false,
              members: [
                { id: "owner", display_name: "オーナー", role: "owner" },
                { id: "member-1", display_name: "メンバー1", role: "member" },
                { id: "member-2", display_name: "メンバー2", role: "member" },
                { id: "member-3", display_name: "メンバー3", role: "member" },
                { id: "member-4", display_name: "メンバー4", role: "member" },
              ],
            },
          }
        : { status: 404, json: { detail: "招待リンクを確認してください" } },
    ),
  );
  await page.route("**/api/group-invites/join", (route) => {
    joins++;
    return route.fulfill({ json: state.group });
  });
  await openGroupList(page);
  await page.getByRole("button", { name: "参加", exact: true }).click();
  await page
    .getByLabel("招待リンク", { exact: true })
    .fill("http://localhost/?groupInvite=invalid");
  await page.getByRole("button", { name: "リンクを確認", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText(
    "招待リンクを確認してください",
  );
  await page
    .getByLabel("招待リンク", { exact: true })
    .fill("http://localhost/?groupInvite=valid-token");
  await page.getByRole("button", { name: "リンクを確認", exact: true }).click();
  await expect(page.locator(".group-join-detail")).toContainText("メンバー 5人");
  await page.getByRole("button", { name: "メンバー一覧を展開" }).click();
  await expect(page.getByText("メンバー4", { exact: true })).toBeVisible();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".group-join-hero")).toBeVisible();
    await expect(page.getByRole("button", { name: "このグループに参加" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  expect(joins).toBe(0);
  await page.getByRole("button", { name: "グループ一覧", exact: false }).click();
  expect(joins).toBe(0);
  await page.getByRole("button", { name: "参加", exact: true }).click();
  await page
    .getByLabel("招待リンク", { exact: true })
    .fill("http://localhost/?groupInvite=valid-token");
  await page.getByRole("button", { name: "リンクを確認", exact: true }).click();
  await page.getByRole("button", { name: "このグループに参加", exact: true }).click();
  await expect(page.getByRole("heading", { name: state.group.name, exact: true })).toBeVisible();
  expect(joins).toBe(1);
});

test("作成後は同じ画面内でQRと招待リンクを表示する", async ({ page }) => {
  const state = await mockTraining(page);
  let created = false;
  let issued = 0;
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
  await page.route("**/api/groups/new-group/invites", (route) => {
    issued++;
    return route.fulfill({ json: { token: "new-token", expires_at: "2026-10-04T00:00:00Z" } });
  });
  await openGroupList(page);
  await page.getByRole("button", { name: "作成", exact: true }).click();
  await page.getByLabel("グループ名", { exact: true }).fill(group.name);
  await page.getByRole("button", { name: "作成する", exact: true }).click();
  await expect(page.getByRole("heading", { name: "メンバーを招待", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: `${group.name}への招待QRコード` })).toBeVisible();
  expect(issued).toBe(1);
  await expect(page.locator(".group-invite-qr-brand svg")).toBeVisible();
  await expect(page.getByRole("button", { name: "リンクを共有", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    document.execCommand = (command) => {
      if (command !== "copy") return false;
      (window as Window & { copiedInvite?: string }).copiedInvite = (
        document.activeElement as HTMLTextAreaElement
      ).value;
      return true;
    };
  });
  await page.getByRole("button", { name: "リンクを共有", exact: true }).click();
  await expect(page.getByText("リンクをコピーしました", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as Window & { copiedInvite?: string }).copiedInvite),
  ).toContain("groupInvite=new-token");
  await page.getByRole("button", { name: "完了", exact: true }).click();
  await expect(page.getByRole("heading", { name: group.name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.state.groupId)).toBe(group.id);
});

test("上段のグループカードと下段のタイムライン絞り込みを分離する", async ({ page }) => {
  const state = await mockTraining(page);
  const second = { ...state.group, id: "second", name: "大学トレ部" };
  await page.route("**/api/groups", (route) => route.fulfill({ json: [state.group, second] }));
  const firstActivity = {
    group_id: state.group.id,
    name: state.group.name,
    member_count: 3,
    live_count: 1,
    today_count: 2,
    totals: { set_count: 1, total_volume: 640 },
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
  const secondActivity = {
    ...firstActivity,
    group_id: second.id,
    name: second.name,
    live_count: 0,
    today_count: 1,
    totals: { set_count: 1, total_volume: 500 },
    members: [
      {
        id: "second-user",
        display_name: "大学の仲間",
        live: false,
        today: true,
      },
    ],
    feed: [
      {
        workout_id: "second-record",
        user_id: "second-user",
        display_name: "大学の仲間",
        exercise: "大学グループだけの記録",
        weight: 100,
        reps: 5,
        estimated_rm: 116.7,
        updated_at: new Date(Date.now() + 1_000).toISOString(),
        best: false,
      },
    ],
  };
  await page.route("**/api/groups/today-activity", (route) => {
    return route.fulfill({
      json: {
        groups: [firstActivity, secondActivity],
        totals: { set_count: 2, total_volume: 1140 },
      },
    });
  });
  await page.reload();
  await expect(page.locator(".feed-item", { hasText: "最初のグループだけの記録" })).toBeVisible();
  await expect(page.locator(".feed-item", { hasText: "大学グループだけの記録" })).toBeVisible();
  await expect(page.getByRole("button", { name: `${state.group.name}の詳細` })).toContainText(
    "2人",
  );
  await expect(
    page.getByRole("button", { name: `${state.group.name}の詳細` }).getByRole("img"),
  ).toHaveCount(1);
  const liveAvatar = page
    .getByRole("button", { name: `${state.group.name}の詳細` })
    .locator(".person-avatar.is-live");
  await expect(liveAvatar).toHaveCSS("outline-width", "2px");
  await expect(liveAvatar).toHaveCSS("border-top-color", "rgb(32, 33, 39)");
  expect(
    await page.locator(".home-feed-tabs").evaluate((tabs) => {
      const first = tabs.firstElementChild?.getBoundingClientRect();
      const last = tabs.lastElementChild?.getBoundingClientRect();
      const track = tabs.getBoundingClientRect();
      return first && last
        ? Math.abs(first.left - track.left - (track.right - last.right))
        : Number.POSITIVE_INFINITY;
    }),
  ).toBeLessThanOrEqual(1);

  // 上段を動かしても、タイムラインは「すべて」のまま変えない。
  await page.getByRole("button", { name: "大学トレ部を表示", exact: true }).click();
  await expect(page.getByRole("button", { name: "大学トレ部を表示", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "すべて", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".feed-item")).toHaveCount(2);

  // 絞り込みは見出し直下の選択だけで行い、待ち時間や旧表示を挟まない。
  await page.getByRole("button", { name: "大学トレ部", exact: true }).click();
  await expect(page.locator(".feed-item")).toHaveCount(1);
  await expect(page.locator(".feed-item")).toContainText("大学グループだけの記録");
  await expect(page.locator(".feed-item")).not.toContainText("最初のグループだけの記録");
  await page.getByRole("button", { name: "すべて", exact: true }).click();
  await expect(page.locator(".feed-item")).toHaveCount(2);
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
});

test("ホームの空状態はみんなのトレーニングを待つ文言にする", async ({ page }) => {
  const state = await mockTraining(page);
  await expect(page.getByText("みんなのトレーニングを待っています", { exact: true })).toBeVisible();
  await expect(page.getByText("まだ記録がありません。", { exact: true })).toHaveCount(0);
});

test("ブラウザの戻るでシート・グループ詳細を閉じ、記録入力は維持する", async ({ page }) => {
  const state = await mockTraining(page);
  await navigate(page, "設定");
  await page.getByRole("button", { name: /^外観/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("region", { name: "今日の活動", exact: true })).toBeVisible();
  await openGroup(page);
  await page.getByRole("button", { name: /招待/ }).click();
  await expect(page.getByRole("heading", { name: "メンバーを招待", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: state.group.name, exact: true })).toBeVisible();
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
  await openGroupList(page);
  await page.getByRole("button", { name: "大学トレ部の詳細", exact: true }).click();
  await expect(page.getByRole("heading", { name: second.name, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "グループ", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: second.name, exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "設定", exact: true })
    .click();
  expect(await page.evaluate(() => history.state.groupId)).toBe(second.id);
  await page.getByRole("button", { name: /招待/ }).click();
  await expect(page.getByRole("heading", { name: "メンバーを招待", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: second.name, exact: true })).toBeVisible();
});

test("新しく参加したグループも招待確認から詳細へ進める", async ({ page }) => {
  const state = await mockTraining(page);
  const joined = { ...state.group, id: "joined", name: "参加先の部活" };
  let member = false;
  await page.route("**/api/group-invites/preview", (route) =>
    route.fulfill({
      json: { ...joined, member_count: 3, already_member: false, members: [] },
    }),
  );
  await page.route("**/api/group-invites/join", (route) => {
    member = true;
    return route.fulfill({ json: joined });
  });
  await page.route("**/api/groups", (route) =>
    route.fulfill({ json: member ? [state.group, joined] : [state.group] }),
  );
  await page.route("**/api/groups/joined", (route) =>
    route.fulfill({ json: { ...joined, members: [] } }),
  );
  await openGroupList(page);
  await page.getByRole("button", { name: "参加", exact: true }).click();
  await page
    .getByLabel("招待リンク", { exact: true })
    .fill("http://localhost/?groupInvite=joined-token");
  await page.getByRole("button", { name: "リンクを確認", exact: true }).click();
  await page.getByRole("button", { name: "このグループに参加", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: joined.name, level: 2, exact: true }),
  ).toBeVisible();
});
