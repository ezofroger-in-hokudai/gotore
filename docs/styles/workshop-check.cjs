const { pathToFileURL } = require("node:url");
const { join } = require("node:path");
const { chromium, expect } = require(
	process.env.PLAYWRIGHT_PACKAGE ||
		"../../frontend/node_modules/@playwright/test",
);
(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	for (const width of [320, 390, 430, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await page.goto(pathToFileURL(join(__dirname, "workshop.html")).href);
		for (const theme of ["light", "dark"]) {
			await page.selectOption("#theme", theme);
			for (const tone of ["warm", "neutral"]) {
				await page.selectOption("#memo-tone", tone);
				if (
					await page.evaluate(
						() => document.documentElement.scrollWidth > innerWidth,
					)
				)
					throw Error(`overflow ${width} ${theme} ${tone}`);
			}
		}
		await page.locator("[data-edit=exercise]").click();
		await page.locator("#memo-input").fill("種目の下書き");
		await page.keyboard.press("Escape");
		await page.locator("[data-edit=workout]").click();
		await expect(page.locator("#memo-input")).toHaveValue(
			"今日はフォームを優先。",
		);
		await page.locator("#close").click();
		await page.locator("[data-edit=exercise]").click();
		await expect(page.locator("#memo-input")).toHaveValue("種目の下書き");
		await page.check("#fail");
		await page.locator("#save").click();
		await expect(page.locator("#error")).toContainText("保存できませんでした");
		await expect(page.locator("#memo-input")).toHaveValue("種目の下書き");
		await page.locator("#save").click();
		await expect(page.locator("#editor")).not.toBeVisible();
		await expect(page.locator("#exercise-text")).toHaveText("種目の下書き");
		await page.locator("[data-edit=exercise]").click();
		await page.locator("#memo-input").fill("");
		await page.locator("#save").click();
		await expect(page.locator("#editor")).not.toBeVisible();
		await page.locator("[data-edit=exercise]").click();
		await expect(page.locator("#memo-input")).toHaveValue("");
		await page.locator("#close").click();
		await page.locator("#toggle").click();
		await expect(page.locator("#memos")).not.toBeVisible();
		await page.locator("#toggle").click();
		await page.evaluate(() => {
			document.documentElement.style.fontSize = "200%";
			document.querySelector(".specimen h3").textContent =
				"長いボタン見出しを表示して文字拡大の折り返しを確認";
		});
		if (
			await page.evaluate(
				() => document.documentElement.scrollWidth > innerWidth,
			)
		)
			throw Error(`zoom overflow ${width}`);
		console.log("PASS workshop", width);
	}
	await page.reload();
	await page.screenshot({
		path: join(__dirname, "workshop-preview.png"),
		fullPage: true,
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.selectOption("#theme", "dark");
	await page.screenshot({
		path: join(__dirname, "workshop-dark.png"),
		fullPage: true,
	});
	if (errors.length) throw Error(errors.join("\n"));
	await browser.close();
})().catch((error) => {
	console.error(error);
	process.exit(1);
});
