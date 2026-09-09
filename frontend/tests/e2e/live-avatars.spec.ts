import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

const png = readFileSync(resolve(__dirname, "../fixtures/avatar.png"));

test("画像をプレビューしてキャンセル・保存失敗・再試行・削除できる", async ({ page }) => {
  await mockTraining(page);
  let saved = {
    version: null as string | null,
    data_url: null as string | null,
  };
  let writes = 0;
  let fail = false;
  await page.route("**/api/me/avatar", async (route) => {
    const method = route.request().method();
    if (method === "PUT") {
      writes++;
      if (fail)
        return route.fulfill({
          status: 503,
          json: { detail: "画像を保存できません" },
        });
      saved = {
        version: "new-avatar",
        data_url: `data:image/jpeg;base64,${route.request().postDataBuffer()?.toString("base64")}`,
      };
    }
    if (method === "DELETE") {
      saved = { version: null, data_url: null };
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: saved });
  });
  await navigate(page, "設定");
  await page.getByRole("button", { name: /^プロフィール画像/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("写真を選ぶ")
    .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
  await expect(dialog.locator(".avatar-preview img")).toBeVisible();
  await dialog.getByRole("button", { name: "選択を取り消す" }).click();
  expect(writes).toBe(0);
  await dialog.getByLabel("写真を選ぶ").setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(dialog.getByRole("alert")).toContainText("JPEG");
  await dialog
    .getByLabel("写真を選ぶ")
    .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
  fail = true;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("保存できません");
  await expect(dialog.locator(".avatar-preview img")).toBeVisible();
  fail = false;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("保存しました。");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: /^プロフィール画像/ }).click();
  await expect(dialog.locator(".avatar-preview img")).toBeVisible();
  await dialog.getByRole("button", { name: "画像を削除", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("画像を削除しました。");
  await expect(dialog.locator(".avatar-preview img")).toHaveCount(0);
});

test("LIVEは右下の丸とラベルで示し、新着だけ強調して期限・切断で止める", async ({ page }) => {
  const state = await mockTraining(page);
  const started = new Date().toISOString();
  const data = {
    group_id: state.group.id,
    member_count: 1,
    live_count: 1,
    today_count: 1,
    observed_at: started,
    members: [
      {
        id: state.user.id,
        display_name: "画面テスト",
        live: true,
        today: true,
        live_until: new Date(Date.now() + 300_000).toISOString(),
      },
    ],
    feed: [
      {
        workout_id: "workout",
        user_id: state.user.id,
        display_name: "画面テスト",
        exercise: "ベンチプレス",
        weight: 80,
        reps: 8,
        estimated_rm: 101.3,
        updated_at: started,
        best: false,
      },
    ],
  };
  await page.route(`**/api/groups/${state.group.id}/activity`, (route) =>
    route.fulfill({ json: data }),
  );
  await page.reload();
  const card = page.getByRole("article");
  await expect(card.locator(".avatar-live-dot")).toBeVisible();
  await expect(card.getByText("LIVE", { exact: true })).toBeVisible();
  await expect(card.locator("time")).toContainText("たった今");
  await expect(card).not.toHaveClass(/feed-arrived/);
  data.feed[0].weight = 82.5;
  data.feed[0].updated_at = new Date(Date.now() + 1000).toISOString();
  await expect(card).toContainText("82.5", { timeout: 10_000 });
  await expect(card).toHaveClass(/feed-arrived/);
  await expect(card).not.toHaveClass(/feed-arrived/, { timeout: 6000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(card.locator(".avatar-live-dot")).toHaveCSS("animation-name", "none");
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(card.locator(".avatar-live-dot")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  data.members[0].live_until = new Date(Date.now() - 1000).toISOString();
  data.observed_at = new Date().toISOString();
  await expect(card.locator(".avatar-live-dot")).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(card.getByText("LIVE", { exact: true })).toHaveCount(0);
});

test("LIVE期限は次の取得が保留中でも切れ、取得失敗で古い表示を隠す", async ({ page }) => {
  const state = await mockTraining(page);
  const started = Date.now();
  let requests = 0;
  let hold = false;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/groups/${state.group.id}/activity`, async (route) => {
    requests++;
    if (hold) {
      await gate;
      return route.fulfill({ status: 503, json: { detail: "状況を取得できません" } });
    }
    return route.fulfill({
      json: {
        group_id: state.group.id,
        member_count: 1,
        live_count: 1,
        today_count: 1,
        observed_at: new Date(started).toISOString(),
        members: [
          {
            id: state.user.id,
            display_name: "期限テスト",
            live: true,
            today: true,
            live_until: new Date(started + 8000).toISOString(),
          },
        ],
        feed: [
          {
            workout_id: "session",
            user_id: state.user.id,
            display_name: "期限テスト",
            exercise: "スクワット",
            weight: 80,
            reps: 5,
            updated_at: new Date(started).toISOString(),
            best: false,
          },
        ],
      },
    });
  });
  try {
    await page.reload();
    await expect(page.getByRole("article").locator(".avatar-live-dot")).toBeVisible();
    hold = true;
    const before = requests;
    await expect.poll(() => requests).toBeGreaterThan(before);
    await expect(page.getByRole("article").locator(".avatar-live-dot")).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(page.getByRole("article")).toContainText("80");
    release();
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.locator(".v2-app").getByRole("alert")).toContainText("状況を取得できません");
  } finally {
    release();
  }
});

test("画像とLIVEは狭い画面・ダーク・文字拡大でも見える", async ({ page }) => {
  const state = await mockTraining(page);
  await navigate(page, "設定");
  await page.route("**/api/profiles/*/avatar", (route) =>
    route.fulfill({
      json: {
        version: "photo",
        data_url: `data:image/png;base64,${png.toString("base64")}`,
      },
    }),
  );
  let imageGets = 0;
  page.on("request", (request) => {
    if (request.url().includes("/profiles/")) imageGets++;
  });
  const now = new Date().toISOString();
  await page.route(`**/api/groups/${state.group.id}/activity`, (route) =>
    route.fulfill({
      json: {
        group_id: state.group.id,
        member_count: 5,
        live_count: 2,
        today_count: 3,
        observed_at: now,
        members: [
          {
            id: state.user.id,
            display_name: "タカギ",
            live: true,
            today: true,
            avatar_version: "photo",
          },
          { id: "friend", display_name: "佐藤", live: true, today: true },
          { id: "friend2", display_name: "ユウタ", live: false, today: true },
        ],
        feed: [
          {
            workout_id: "a",
            user_id: state.user.id,
            display_name: "タカギ",
            exercise: "ベンチプレス",
            weight: 82.5,
            reps: 8,
            updated_at: now,
            best: true,
          },
          {
            workout_id: "b",
            user_id: "friend",
            display_name: "佐藤",
            exercise: "スクワット",
            weight: 100,
            reps: 5,
            updated_at: new Date(Date.now() - 120_000).toISOString(),
            best: false,
          },
          {
            workout_id: "c",
            user_id: "friend2",
            display_name: "ユウタ",
            exercise: "ラットプルダウン",
            weight: 45,
            reps: 10,
            updated_at: new Date(Date.now() - 3_600_000).toISOString(),
            best: false,
          },
        ],
      },
    }),
  );
  await page.reload();
  await expect(page.getByRole("article").first().locator(".person-avatar img")).toBeVisible();
  expect(imageGets).toBe(1);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/live-home-${width}.png`, fullPage: true });
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.screenshot({ path: "test-results/live-home-dark.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".community-card strong, .stat-label, .feed-name strong, .feed-person p, .feed-item time, .live-badge, .feed-value strong, .feed-value small",
      ),
    );
    const sizes = elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    elements.forEach((element, index) => {
      element.style.fontSize = `${sizes[index] * 2}px`;
    });
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
