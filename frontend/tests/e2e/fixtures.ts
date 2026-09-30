import { test as base, expect } from "@playwright/test";

export { expect };
export type { ElementHandle, Locator, Page } from "@playwright/test";

export const test = base.extend<{ diagnostics: undefined }>({
  diagnostics: [
    async ({ page }, use, info) => {
      const errors: string[] = [];
      const requests: { method: string; path: string; status: number }[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.pathname.startsWith("/api/"))
          requests.push({
            method: response.request().method(),
            path: url.pathname,
            status: response.status(),
          });
      });
      await use(undefined);
      if (info.status !== info.expectedStatus || errors.length)
        await info.attach("browser-diagnostics", {
          body: JSON.stringify({ errors, requests }, null, 2),
          contentType: "application/json",
        });
      expect(errors, "未処理のブラウザ例外").toEqual([]);
    },
    { auto: true },
  ],
});
