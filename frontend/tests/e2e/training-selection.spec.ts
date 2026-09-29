import { expect, test } from "@playwright/test";
import { mockTraining, openTraining } from "./mock-training";

test("0セットの要約は開かず、最初のセットを追加すると展開できる", async ({ page }) => {
  await mockTraining(page);
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();

  const today = page.locator(".today-training");
  await expect(today).toContainText("0セット");
  await expect(today.locator("summary")).toHaveCount(0);
  await expect(today).not.toContainText("…");
  const emptyHeight = (await today.boundingBox())?.height;

  await page.getByRole("button", { name: /^ベンチプレス/ }).click();
  await expect(page.getByRole("button", { name: "セットを追加", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await expect(today.locator("summary")).toBeVisible();
  const marker = today.locator(".today-training-marker");
  await expect(marker).toHaveCSS("font-size", "10px");
  const markerBox = await marker.boundingBox();
  const titleBox = await today.locator(".today-training-title").boundingBox();
  expect(markerBox?.x).toBeLessThan(titleBox?.x ?? 0);
  const closedMarkerStyle = await marker.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return {
      content: style.content,
      height: style.height,
      transform: style.transform,
      width: style.width,
    };
  });
  expect(closedMarkerStyle.content).toBe('""');
  await expect(today.locator("summary")).not.toContainText("…");
  expect((await today.boundingBox())?.height).toBe(emptyHeight);
  await today.locator("summary").click();
  const openMarkerStyle = await marker.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return {
      content: style.content,
      height: style.height,
      transform: style.transform,
      width: style.width,
    };
  });
  expect(openMarkerStyle.width).toBe(closedMarkerStyle.width);
  expect(openMarkerStyle.height).toBe(closedMarkerStyle.height);
  expect(openMarkerStyle.transform).not.toBe(closedMarkerStyle.transform);
  await expect(today).toContainText("SET 1");
});

test("種目選択は仲間のタイムラインを取得せず、部位で候補を絞り込める", async ({ page }) => {
  const state = await mockTraining(page);
  state.options = [
    {
      id: "option-bench",
      name: "ベンチプレス",
      primary_body_part: "chest",
      secondary_body_parts: ["arms"],
    },
    {
      id: "option-squat",
      name: "スクワット",
      primary_body_part: "legs",
      secondary_body_parts: [],
    },
  ];
  let todayActivityRequests = 0;
  await page.route("**/api/groups/today-activity", async (route) => {
    todayActivityRequests++;
    await route.fulfill({
      json: { totals: { set_count: 0, total_volume: 0 }, groups: [] },
    });
  });

  // mockTrainingの初期表示後に候補を差し替えるため、選択画面を開く前に再取得する。
  await page.reload();
  const homeHeaderHeight = await page
    .locator(".app-header")
    .evaluate((header) => header.getBoundingClientRect().height);
  const homeGroupOption = await page
    .locator(".home-feed-tabs button")
    .first()
    .evaluate((button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      return {
        height: box.height,
        fontSize: style.fontSize,
        borderRadius: style.borderRadius,
      };
    });
  const requestsBeforeTraining = todayActivityRequests;
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();

  await expect(page.locator(".session-wordmark")).toHaveText("E-GOTORE");
  await expect(page.getByRole("heading", { name: "種目を選択", exact: true })).toHaveCount(0);
  const sessionHeader = page.locator(".session-header");
  await expect(sessionHeader).toHaveCSS("position", "sticky");
  expect((await sessionHeader.boundingBox())?.y).toBe(0);
  expect((await sessionHeader.boundingBox())?.height).toBe(homeHeaderHeight);
  await expect(page.getByRole("region", { name: "今日の仲間", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "すべて", exact: true })).toHaveCount(0);
  expect(todayActivityRequests).toBe(requestsBeforeTraining);
  const firstPart = await page
    .getByRole("button", { name: "胸", exact: true })
    .evaluate((button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      return {
        height: box.height,
        fontSize: style.fontSize,
        borderRadius: style.borderRadius,
      };
    });
  expect(firstPart).toEqual(homeGroupOption);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const partLayout = await page.locator(".session-body-parts").evaluate((parts) => {
      const buttons = [...parts.querySelectorAll("button")].map((button) =>
        button.getBoundingClientRect(),
      );
      return {
        overflows: parts.scrollWidth > parts.clientWidth,
        rows: new Set(buttons.map((button) => Math.round(button.top))).size,
        widths: buttons.map((button) => button.width),
      };
    });
    expect(partLayout.overflows).toBe(false);
    expect(partLayout.rows).toBe(1);
    expect(Math.max(...partLayout.widths) - Math.min(...partLayout.widths)).toBeLessThanOrEqual(1);
  }
  const centeredExercise = page.getByRole("button", { name: /^ベンチプレス/ });
  expect(
    await centeredExercise.evaluate((button) => {
      const row = button.getBoundingClientRect();
      const title = button.querySelector("strong")?.getBoundingClientRect();
      return title
        ? Math.abs(title.top + title.height / 2 - (row.top + row.height / 2))
        : Number.POSITIVE_INFINITY;
    }),
  ).toBeLessThanOrEqual(1);
  await expect(centeredExercise).toBeVisible();
  await page.getByRole("button", { name: "脚", exact: true }).click();
  await expect(page.getByRole("button", { name: /^スクワット/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^ベンチプレス/ })).toHaveCount(0);
  const selectedPart = page.getByRole("button", { name: "脚", exact: true });
  await expect(selectedPart).toHaveCSS("border-top-style", "solid");
  await expect(selectedPart).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(selectedPart).toHaveCSS("box-shadow", /rgba?\(0, 0, 0/);
  await page.getByRole("button", { name: "＋ 種目を追加", exact: true }).click();
  const addSheet = page.getByRole("dialog", {
    name: "種目を追加",
    exact: true,
  });
  await expect(addSheet.getByLabel("新しい種目", { exact: true })).toBeVisible();
  await expect(addSheet.getByRole("heading", { name: "種目を追加", exact: true })).toHaveCount(1);
  await expect(addSheet.getByRole("searchbox")).toHaveCount(0);
  await addSheet.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("button", { name: "トレーニング終了", exact: true })).toBeVisible();
  const selectingFinish = await page
    .getByRole("button", { name: "トレーニング終了", exact: true })
    .evaluate((button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        background: style.backgroundColor,
        color: style.color,
        radius: style.borderRadius,
      };
    });
  await page.getByRole("button", { name: /^スクワット/ }).click();
  const recordingFinish = await page
    .getByRole("button", { name: "トレーニング終了", exact: true })
    .evaluate((button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        background: style.backgroundColor,
        color: style.color,
        radius: style.borderRadius,
      };
    });
  expect(recordingFinish).toEqual(selectingFinish);
});
