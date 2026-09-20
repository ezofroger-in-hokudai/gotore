import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

async function openBox(page: import("@playwright/test").Page) {
  await navigate(page, "設定");
  await page.getByRole("button", { name: "目安箱", exact: true }).click();
}

test("目安箱は失敗しても内容とIDを保ち、閉じた後に再送できる", async ({ page }) => {
  await mockTraining(page);
  const sent: { id: string; content: string }[] = [];
  await page.route("**/api/suggestions", async (route) => {
    sent.push(route.request().postDataJSON());
    if (sent.length === 1) return route.abort();
    return route.fulfill({
      status: 201,
      json: { id: sent[0].id, created_at: new Date().toISOString() },
    });
  });
  await openBox(page);
  const dialog = page.getByRole("dialog", { name: "目安箱", exact: true });
  await expect(dialog).toContainText("内容と送信者は運営管理者だけが確認します");
  await dialog.getByLabel("内容", { exact: true }).fill("  履歴をもっと見やすくしたい  ");
  await dialog.getByRole("button", { name: "送信する", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("通信できません");
  await expect(dialog.getByLabel("内容", { exact: true })).toHaveValue(
    "  履歴をもっと見やすくしたい  ",
  );
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "目安箱", exact: true }).click();
  await dialog.getByRole("button", { name: "再送する", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("送信しました");
  expect(sent).toHaveLength(2);
  expect(sent[0]).toEqual(sent[1]);
  expect(sent[0].content).toBe("履歴をもっと見やすくしたい");
  await expect(dialog.getByLabel("内容", { exact: true })).toHaveValue("");
});

test("空白を拒否し、送信待ちの開閉でも二重投稿しない", async ({ page }) => {
  await mockTraining(page);
  let count = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/suggestions", async (route) => {
    count++;
    await gate;
    return route.fulfill({
      status: 201,
      json: {
        id: route.request().postDataJSON().id,
        created_at: new Date().toISOString(),
      },
    });
  });
  await openBox(page);
  const dialog = page.getByRole("dialog", { name: "目安箱", exact: true });
  await dialog.getByLabel("内容", { exact: true }).fill("　 \n");
  await dialog.getByRole("button", { name: "送信する", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("1〜2000文字");
  expect(count).toBe(0);
  await dialog.getByLabel("内容", { exact: true }).fill("記録中の表示を改善したいです");
  await dialog.getByRole("button", { name: "送信する", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "送信中…", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "目安箱", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "送信中…", exact: true })).toBeDisabled();
  release();
  await expect(dialog.getByRole("status")).toContainText("送信しました");
  expect(count).toBe(1);
});

for (const width of [320, 390, 430]) {
  test(`目安箱 ${width}pxで入力と送信操作を表示する`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockTraining(page);
    await openBox(page);
    await expect(page.getByRole("button", { name: "送信する", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `../docs/images/suggestion-box/settings-${width}.png`,
      fullPage: true,
    });
  });
}
