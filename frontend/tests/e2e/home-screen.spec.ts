import { expect, test } from "@playwright/test";

test("ホーム画面用のメタ情報と各サイズのPNGを配信する", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute(
    "content",
    "yes",
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    "content",
    "GO TORE",
  );
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/,
  );
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const webManifest = await manifest.json();
  expect(webManifest.display).toBe("standalone");
  const iconPaths: string[] = webManifest.icons.map((icon: { src: string }) => icon.src);
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", iconPaths[0]);
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(apple).toBeTruthy();
  if (!apple) throw new Error("Apple用アイコンが設定されていません。");
  for (const [path, size] of [
    [iconPaths[0], 192],
    [iconPaths[1], 512],
    [apple, 180],
  ] as const) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    const body = await response.body();
    expect(body.subarray(1, 4).toString()).toBe("PNG");
    expect(body.readUInt32BE(16)).toBe(size);
    expect(body.readUInt32BE(20)).toBe(size);
  }
  expect((await request.get("/app-icons/999")).status()).toBe(404);
  await expect(page.getByLabel("メールアドレス", { exact: true })).toHaveCSS("font-size", "16px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
