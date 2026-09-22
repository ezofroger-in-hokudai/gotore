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
			if (
				await page.evaluate(
					() => document.documentElement.scrollWidth > innerWidth,
				)
			)
				throw Error(`overflow ${width} ${theme}`);
		}
		await page.locator(".sample").first().click();
		await expect(page.locator("#button-status")).toContainText("保存");
		await expect(page.locator('a[href="index.html#memo"]')).toBeVisible();
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
