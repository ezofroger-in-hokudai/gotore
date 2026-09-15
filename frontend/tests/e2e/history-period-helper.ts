import type { Page } from "@playwright/test";

export async function chooseHistoryMonth(page: Page, month: string) {
  const calendar = page.locator(".activity-calendar:visible");
  await calendar.locator(".history-period-picker > button").first().click();
  const dialog = calendar.getByRole("dialog");
  await dialog.getByLabel("月", { exact: true }).fill(month);
  if (await dialog.isVisible())
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
}
export async function moveHistoryMonth(page: Page, direction: number) {
  const input = page.locator('.activity-calendar:visible input[type="month"]');
  const date = new Date(`${await input.inputValue()}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  await chooseHistoryMonth(page, date.toISOString().slice(0, 7));
}
