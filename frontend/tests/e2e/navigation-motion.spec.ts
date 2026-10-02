import { expect, test } from "./fixtures";
import { mockTraining } from "./mock-training";

test("画面を切り替えた直後に元画面のスナップショットを重ねない", async ({ page }) => {
  await page.addInitScript(() => {
    const original = document.startViewTransition.bind(document);
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (update: () => void) => {
        const transition = original(update);
        void transition.ready.then(() => {
          const state = window as typeof window & { previousScreenOpacity?: string };
          state.previousScreenOpacity = getComputedStyle(
            document.documentElement,
            "::view-transition-old(gotore-content)",
          ).opacity;
        });
        return transition;
      },
    });
  });
  await mockTraining(page);
  await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("button", { name: "グループ" })
    .dispatchEvent("click");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { previousScreenOpacity?: string }).previousScreenOpacity,
      ),
    )
    .toBe("0");
});

test("固定操作を画面内容より手前に保ち、タブ切替中も表示し続ける", async ({ page }) => {
  await page.addInitScript(() => {
    const original = document.startViewTransition.bind(document);
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (update: () => void) => {
        const transition = original(update);
        void transition.ready.then(() => {
          const state = window as typeof window & {
            fixedLayers?: { name: string; zIndex: string; opacity: string }[];
          };
          state.fixedLayers = [".app-header", ".floating-training", ".bottom-nav"].map(
            (selector) => {
              const element = document.querySelector(selector);
              if (!element) throw new Error(`${selector}がありません`);
              const name = getComputedStyle(element).viewTransitionName;
              return {
                name,
                zIndex: getComputedStyle(
                  document.documentElement,
                  `::view-transition-group(${name})`,
                ).zIndex,
                opacity: getComputedStyle(
                  document.documentElement,
                  `::view-transition-new(${name})`,
                ).opacity,
              };
            },
          );
        });
        return transition;
      },
    });
  });
  await mockTraining(page);
  await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("button", { name: "グループ" })
    .dispatchEvent("click");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              fixedLayers?: { name: string; zIndex: string; opacity: string }[];
            }
          ).fixedLayers,
      ),
    )
    .toEqual([
      { name: "gotore-header", zIndex: "1", opacity: "1" },
      { name: "gotore-training-shortcut", zIndex: "1", opacity: "1" },
      { name: "gotore-bottom-nav", zIndex: "1", opacity: "1" },
    ]);
  await expect(page.getByTestId("floating-training")).toBeVisible();
});

test("画面とグループ詳細は控えめな横移動で進み、履歴では逆向きに戻る", async ({ page }) => {
  await page.addInitScript(() => {
    const original = document.startViewTransition.bind(document);
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (update: () => void) => {
        const directions = window as typeof window & { motionDirections?: string[] };
        directions.motionDirections ??= [];
        directions.motionDirections.push(
          document.documentElement.dataset.gotoreNavigationDirection ?? "",
        );
        return original(update);
      },
    });
  });
  const state = await mockTraining(page);
  const nav = page.getByRole("navigation", { name: "メインナビゲーション" });
  await nav.getByRole("button", { name: "グループ" }).click();
  await expect(page.getByRole("heading", { name: "グループ", exact: true })).toBeVisible();
  await page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true }).click();
  await expect(page.getByRole("heading", { name: state.group.name, level: 2 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "グループ", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("region", { name: "今日の活動", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "グループ", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: state.group.name, level: 2 })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as typeof window & { motionDirections?: string[] }).motionDirections,
    ),
  ).toEqual(["forward", "forward", "back", "back", "forward", "forward"]);
});

test("連続してタブを選んでも最後の画面と戻り先が一致する", async ({ page }) => {
  await mockTraining(page);
  const nav = page.getByRole("navigation", { name: "メインナビゲーション" });
  await nav.getByRole("button", { name: "グループ" }).click();
  await nav.getByRole("button", { name: "履歴" }).click();
  await nav.getByRole("button", { name: "設定" }).click();
  await expect(nav.getByRole("button", { name: "設定" })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(nav.getByRole("button", { name: "履歴" })).toHaveAttribute("aria-current", "page");
});

test("遷移直後に元のタブを選び直しても最後の画面を表示する", async ({ page }) => {
  await mockTraining(page);
  const nav = page.getByRole("navigation", { name: "メインナビゲーション" });
  await nav.getByRole("button", { name: "グループ" }).dispatchEvent("click");
  await nav.getByRole("button", { name: "ホーム" }).dispatchEvent("click");
  await expect(nav.getByRole("button", { name: "ホーム" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "今日の活動", exact: true })).toBeVisible();
});

test("選択中の各タブを再タップすると入口の先頭へ戻る", async ({ page }) => {
  await mockTraining(page);
  const nav = page.getByRole("navigation", { name: "メインナビゲーション" });
  await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(".main-content");
    if (!main) throw new Error("main-content not found");
    main.style.height = "300px";
    main.style.overflowY = "auto";
    const spacer = document.createElement("div");
    spacer.style.height = "2400px";
    main.append(spacer);
  });

  for (const name of ["ホーム", "グループ", "履歴", "設定"]) {
    const button = nav.getByRole("button", { name, exact: true });
    if ((await button.getAttribute("aria-current")) !== "page") await button.click();
    await page.evaluate(() => {
      window.scrollTo({ top: 900 });
      document.querySelector<HTMLElement>(".main-content")?.scrollTo({ top: 900 });
    });
    expect(
      await page.evaluate(() =>
        Math.max(
          window.scrollY,
          document.querySelector<HTMLElement>(".main-content")?.scrollTop ?? 0,
        ),
      ),
    ).toBeGreaterThan(0);

    await button.click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Math.max(
            window.scrollY,
            document.querySelector<HTMLElement>(".main-content")?.scrollTop ?? 0,
          ),
        ),
      )
      .toBe(0);
  }
});

test("動きを減らす設定では画面を即時に切り替える", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockTraining(page);
  await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("button", { name: "設定" })
    .click();
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-gotore-navigation-direction");
});
