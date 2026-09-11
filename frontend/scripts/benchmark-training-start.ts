import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { mockTraining, navigate } from "../tests/e2e/mock-training";

const browser = await chromium.launch();
const samples: {
  inputMs: number;
  contextMs: number;
  readsBeforeSelection: number;
  readsAfterSelection: number;
}[] = [];
try {
  for (let sample = 0; sample < 6; sample++) {
    const browserContext = await browser.newContext({
      baseURL: process.env.BENCHMARK_BASE_URL || "http://127.0.0.1:3100",
      viewport: { width: 390, height: 844 },
    });
    const page = await browserContext.newPage();
    page.on("dialog", (dialog) => void dialog.accept());
    await mockTraining(page);
    await navigate(page, "記録");
    let squatReads = 0;
    await page.route("**/api/sessions", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return route.fallback();
    });
    await page.route("**/api/exercises/context?*", async (route) => {
      if (new URL(route.request().url()).searchParams.get("name") === "スクワット") squatReads++;
      await new Promise((resolve) => setTimeout(resolve, 600));
      return route.fallback();
    });
    let started = performance.now();
    await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
    await page.getByRole("button", { name: /^ベンチプレス/ }).click();
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toBeEnabled();
    const inputMs = Math.round(performance.now() - started);
    const screenshots = process.env.SCREENSHOT_DIR;
    if (sample === 5 && screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("62.5");
      await page.screenshot({ path: `${screenshots}/starting.png`, fullPage: true });
    }
    await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toBeEnabled();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
    const readsBeforeSelection = squatReads;
    started = performance.now();
    await page.getByRole("button", { name: /^スクワット/ }).click();
    await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toBeEnabled();
    const contextMs = Math.round(performance.now() - started);
    if (sample === 5 && screenshots)
      await page.screenshot({ path: `${screenshots}/context.png`, fullPage: true });
    if (sample)
      samples.push({ inputMs, contextMs, readsBeforeSelection, readsAfterSelection: squatReads });
    await browserContext.close();
  }
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  console.log(
    JSON.stringify(
      {
        startDelayMs: 1200,
        contextDelayMs: 600,
        samples,
        medianInputMs: median(samples.map((sample) => sample.inputMs)),
        medianContextMs: median(samples.map((sample) => sample.contextMs)),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
