import { expect, test } from "@playwright/test";
import { mockTraining, openTraining } from "./mock-training";

test("長いグループ名はホームの選択列で一定幅に収まり、正式名で選べる", async ({ page }) => {
  const state = await mockTraining(page);
  const shortTab = page.locator(".home-feed-tabs .group-name-tab");
  await expect(shortTab).toBeVisible();
  expect(
    await shortTab.evaluate((button) => {
      const label = button.querySelector("span");
      return label ? label.scrollWidth <= label.clientWidth : false;
    }),
  ).toBe(true);
  const names = [
    "北海道大学トレーニングサークルの仲間たち",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    "🏋️‍♀️みんなでトレーニングするグループ🏋️‍♂️",
  ];

  for (const name of names) {
    state.group.name = name;
    await page.reload();
    const homeTab = page.locator(".home-feed-tabs").getByRole("button", { name, exact: true });
    await expect(homeTab).toBeVisible();
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const measurements = await homeTab.evaluate((button) => ({
        width: button.getBoundingClientRect().width,
        textOverflows:
          (button.querySelector("span")?.scrollWidth ?? 0) >
          (button.querySelector("span")?.clientWidth ?? 0),
        fade: getComputedStyle(button, "::after").backgroundImage,
        pageOverflows: document.documentElement.scrollWidth > innerWidth,
      }));
      expect(measurements.width).toBe(112);
      expect(measurements.textOverflows).toBe(true);
      expect(measurements.fade).toContain("linear-gradient");
      expect(measurements.pageOverflows).toBe(false);
      if (name === names[0] && width === 390) {
        await page.screenshot({ path: "test-results/group-tab-home-390.png" });
      }
    }
    await homeTab.click();
    await expect(homeTab).toHaveAttribute("aria-pressed", "true");
  }

  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("tab", { name: names[2], exact: true })).toHaveCount(0);
  await expect(page.locator(".exercise-picker-list")).toBeVisible();
  await page.screenshot({ path: "test-results/group-tab-training-390.png" });
});
