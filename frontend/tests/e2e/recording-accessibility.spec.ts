import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}pxの記録操作は48px領域と12px以上の補助文字を確保する`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await mockTraining(page);
    await startTraining(page);
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
    const labels = [
      "重量を増やす",
      "重量を減らす",
      "回数を増やす",
      "回数を減らす",
      "次のセットへ",
      "次の種目へ",
      "トレーニング終了",
      "セット1を編集",
      "今回のメモを編集",
    ];
    for (const name of labels) {
      const button = page.getByRole("button", { name, exact: true });
      const box = await button.boundingBox();
      expect(box?.width, name).toBeGreaterThanOrEqual(48);
      expect(box?.height, name).toBeGreaterThanOrEqual(48);
      await expect(button).toBeInViewport({ ratio: 1 });
      const nav = await page.getByRole("navigation").boundingBox();
      expect((box?.y ?? 0) + (box?.height ?? 0), name).toBeLessThanOrEqual(nav?.y ?? 720);
      expect(
        await button.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 2),
          );
        }),
        name,
      ).toBe(true);
    }
    const smallText = await page.locator(".session-screen").evaluate((root) =>
      Array.from(root.querySelectorAll<HTMLElement>("span, small, label, button, p, h2, strong"))
        .filter(
          (node) =>
            node.getClientRects().length &&
            node.textContent?.trim() &&
            node.children.length === 0 &&
            !node.closest('[aria-hidden="true"]'),
        )
        .map((node) => ({
          text: node.textContent,
          size: Number.parseFloat(getComputedStyle(node).fontSize),
        }))
        .filter((value) => value.size < 12),
    );
    expect(smallText).toEqual([]);
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      })),
    ).toEqual({ width, height: 720 });
    await page.screenshot({
      path: `test-results/recording-accessible-${width}.png`,
      fullPage: true,
    });
  });
}

for (const mode of ["文字200%", "キーボード相当の高さ", "safe area相当の余白"]) {
  test(`${mode}でも数値と保存操作が欠けない`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: mode === "キーボード相当の高さ" ? 420 : 720 });
    await mockTraining(page);
    await startTraining(page);
    if (mode === "文字200%") await page.addStyleTag({ content: "html { font-size: 200%; }" });
    if (mode === "safe area相当の余白") {
      // OSが返す余白を置き換え、ナビを含む既存の全CSS規則で検証する。
      await page.evaluate(() => {
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            const css = Array.from(sheet.cssRules)
              .map((rule) => rule.cssText)
              .join("\n");
            if (!css.includes("env(safe-area-inset-")) continue;
            const style = document.createElement("style");
            style.textContent = css
              .replaceAll("env(safe-area-inset-top)", "20px")
              .replaceAll("env(safe-area-inset-bottom)", "34px");
            document.head.append(style);
          } catch {}
        }
      });
    }
    for (const name of ["重量", "回数"]) {
      const field = page.getByRole("spinbutton", { name, exact: true });
      await field.fill("1000");
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeInViewport({ ratio: 1 });
      const fits = await field.evaluate((element: HTMLInputElement) => {
        const style = getComputedStyle(element);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("文字幅を計測できません");
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return context.measureText(element.value).width <= element.clientWidth;
      });
      expect(fits, name).toBe(true);
    }
    for (const name of [
      "重量を増やす",
      "回数を減らす",
      "次のセットへ",
      "次の種目へ",
      "トレーニング終了",
    ]) {
      const button = page.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      expect(
        await button.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 2),
          );
        }),
        name,
      ).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });
}
