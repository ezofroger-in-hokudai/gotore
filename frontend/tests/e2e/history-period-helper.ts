import { type Page, expect } from "@playwright/test";

export async function historyMonth(page: Page) {
  const label = await page
    .locator(".personal-history-calendar:visible .personal-history-month strong")
    .innerText();
  const match = label.match(/(\d+)年(\d+)月/);
  if (!match) throw new Error(`月表示を読み取れません: ${label}`);
  return `${match[1]}-${match[2].padStart(2, "0")}`;
}

export async function chooseHistoryMonth(page: Page, month: string) {
  for (let step = 0; step < 2400; step++) {
    const current = await historyMonth(page);
    if (current === month) return;
    await moveHistoryMonth(page, current > month ? -1 : 1);
  }
  throw new Error(`指定月へ移動できません: ${month}`);
}

export async function moveHistoryMonth(page: Page, direction: number) {
  const current = await historyMonth(page);
  const date = new Date(`${current}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  const calendar = page.locator(".personal-history-calendar:visible");
  await calendar.dispatchEvent("keydown", { key: direction < 0 ? "ArrowLeft" : "ArrowRight" });
  await expect(calendar.locator(".personal-history-month strong")).toHaveText(
    `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`,
  );
}
