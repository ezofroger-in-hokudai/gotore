const { pathToFileURL } = require("node:url");
const { join } = require("node:path");
const { chromium } = require(
	process.env.PLAYWRIGHT_PACKAGE ||
		"../../frontend/node_modules/@playwright/test",
);
(async () => {
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	for (const width of [320, 390, 430, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await page.goto(pathToFileURL(join(__dirname, "index.html")).href);
		for (const theme of ["light", "dark"]) {
			await page.selectOption("#theme", theme);
			if (
				await page.evaluate(
					() => document.documentElement.scrollWidth > innerWidth,
				)
			)
				throw Error("overflow " + width + " " + theme);
		}
		await page.locator("#memo-toggle").click();
		if (await page.locator("#recording-memos").isVisible())
			throw Error("memo close");
		await page.locator("#memo-toggle").click();
		await page.locator("#memo-text").click();
		await page.locator("#memo-input").fill("確認用のメモ");
		await page.locator("#memo-form button[type=submit]").click();
		if ((await page.locator("#memo-text").innerText()) !== "確認用のメモ")
			throw Error("memo save");
		await page.locator("#reaction").click();
		if ((await page.locator("#count").innerText()) !== "3")
			throw Error("reaction");
		await page.locator("#reaction").click();
		if ((await page.locator("#count").innerText()) !== "2")
			throw Error("cancel");
		await page.locator("#people").click();
		if (!(await page.locator("#senders").isVisible())) throw Error("people");
		await page.selectOption("#width", "320");
		await page.check("#targets");
		console.log("PASS", width);
	}
	await page.reload();
	await page.selectOption("#width", "390");
	await page.screenshot({
		path: join(__dirname, "preview.png"),
		fullPage: true,
	});
	if (errors.length) throw Error(errors.join("\n"));
	await browser.close();
})();
