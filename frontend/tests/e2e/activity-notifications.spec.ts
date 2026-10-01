import { expect, test } from "@playwright/test";
import type { ActivityNotification } from "../../src/features/notifications/types";
import { mockTraining, navigate, startTraining } from "./mock-training";

function event(
  id: number,
  kind: "stamp" | "start" = "stamp",
  sender = String(id),
): ActivityNotification {
  return {
    id: `notice-${id}`,
    kind,
    sender_id: sender,
    display_name: id % 2 ? "柳町和音" : "森下快",
    avatar_version: null,
    workout_id: `workout-${id}`,
    stamp_kind: (["encourage", "push", "bad", "amazing", "praise", "tengu"] as const)[id % 6],
    created_at: new Date().toISOString(),
    live_until: kind === "start" ? new Date(Date.now() + 300000).toISOString() : null,
  };
}
async function fixture(page: Parameters<typeof mockTraining>[0]) {
  await page.clock.install();
  const training = await mockTraining(page);
  let items: ActivityNotification[] = [];
  const seen = new Set<string>();
  const live = new Set<string>();
  await page.route("**/api/notifications/inbox", (route) =>
    route.fulfill({
      json: {
        items: items.filter((x) => !seen.has(x.id)),
        live_start_ids: [...live],
      },
    }),
  );
  await page.route("**/api/notifications/seen", (route) => {
    for (const id of route.request().postDataJSON().ids) seen.add(id);
    return route.fulfill({ status: 204 });
  });
  return {
    training,
    seen,
    receive(list: ActivityNotification[]) {
      items.push(...list);
      for (const x of list) if (x.kind === "start") live.add(x.id);
    },
    end(id: string) {
      live.delete(id);
      items = items.filter((x) => x.id !== id);
    },
  };
}
for (const width of [320, 390, 430])
  test(`${width}px: 即時カットイン中のSTART/RESUMEを一度で操作、終了済みは除外`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const f = await fixture(page);
    f.receive([event(1, "start")]);
    await page.clock.runFor(2100);
    await expect(page.locator(".activity-start")).toContainText("1人がトレーニング開始");
    await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
    await expect(page.locator(".activity-start")).toHaveCount(0);
    await page.getByRole("button", { name: /^ベンチプレス/ }).click();
    f.receive([event(2, "start"), event(3, "start")]);
    await page.clock.runFor(2100);
    await expect(page.locator(".activity-start")).toHaveCount(0);
    f.end("notice-3");
    await page.clock.runFor(2100);
    await navigate(page, "ホーム");
    await expect(page.locator(".activity-start")).toContainText("1人がトレーニング開始");
    await page.getByTestId("floating-training").click();
    await expect(page.getByRole("button", { name: "セットを追加", exact: true })).toBeVisible();
    await expect(page.locator(".activity-start")).toHaveCount(0);
  });
test("スタンプは全画面継続・5送り主/10件で集約・届いた種類だけ横一列", async ({ page }) => {
  const f = await fixture(page);
  f.receive([event(1)]);
  await page.clock.runFor(2100);
  await expect(page.locator(".activity-stamp")).toContainText("柳町和音からスタンプ");
  await navigate(page, "グループ");
  await expect(page.locator(".activity-stamp")).toBeVisible();
  await page.clock.runFor(700);
  await expect(page.locator(".activity-stamp")).toHaveCount(0);
  f.receive([2, 3, 4, 5, 6].map((i) => event(i)));
  await page.clock.runFor(1400);
  await expect(page.locator(".activity-stamp")).toContainText("5件のスタンプが届いた");
  await expect(page.locator(".activity-stamp-kind")).toHaveCount(5);
  await page.clock.runFor(400);
  const r = await page.locator(".activity-stamp").boundingBox();
  if (!r) throw Error("card missing");
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2 - 60, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(page.locator(".activity-stamp")).toHaveCount(0);
  f.receive(Array.from({ length: 10 }, (_, i) => event(i + 10, "stamp", "same")));
  await page.clock.runFor(2100);
  await expect(page.locator(".activity-stamp")).toContainText("10件のスタンプが届いた");
  await expect(page.locator(".activity-stamp-kind")).toHaveCount(6);
});
test("起動中の追加開始は同じカットインを更新し表示時間を延長しない", async ({ page }) => {
  const f = await fixture(page);
  f.receive([event(1, "start")]);
  await page.clock.runFor(2100);
  const first = await page.locator(".activity-start").elementHandle();
  f.receive([event(2, "start"), event(3, "start")]);
  await page.clock.runFor(2000);
  await expect(page.locator(".activity-start")).toContainText("3人がトレーニング開始");
  expect(await first?.evaluate((e) => e.isConnected)).toBe(true);
  await page.clock.runFor(3100);
  await expect(page.locator(".activity-start")).toHaveCount(0);
});
test("設定変更は保存し、画面タップが背景の記録操作を妨げない", async ({ page }) => {
  const f = await fixture(page);
  let saved = {
    stamp_enabled: true,
    start_enabled: true,
    start_timing: "home",
    vibration: true,
    sound: false,
    push_stamp: true,
    push_start: true,
  };
  await page.route("**/api/notifications/settings", (route) => {
    if (route.request().method() === "PUT") saved = route.request().postDataJSON();
    return route.fulfill({ json: saved });
  });
  await navigate(page, "設定");
  await page.getByRole("button", { name: "通知", exact: true }).click();
  await page.getByLabel("スタンプ通知", { exact: true }).uncheck();
  await expect.poll(() => saved.stamp_enabled).toBe(false);
  await page.getByLabel("開始通知を出すタイミング").selectOption("now");
  await expect.poll(() => saved.start_timing).toBe("now");
  await page
    .getByRole("dialog", { name: "通知", exact: true })
    .getByRole("button", { name: "閉じる", exact: true })
    .click();
  await navigate(page, "履歴");
  f.receive([event(1, "stamp"), event(2, "start")]);
  await page.clock.runFor(2100);
  await expect(page.locator(".activity-stamp")).toHaveCount(0);
  await expect(page.locator(".activity-start")).toBeVisible();
  await page
    .getByRole("region", { name: "個人の履歴", exact: true })
    .click({ position: { x: 10, y: 10 } });
  await expect(page.locator(".activity-start")).toHaveCount(0);
});
test("スワイプ中はタイマーを止め、操作取消後は残り時間で閉じる", async ({ page }) => {
  const f = await fixture(page);
  f.receive([2, 3, 4, 5, 6].map((i) => event(i)));
  await page.clock.runFor(2100);
  await expect(page.locator(".activity-stamp")).toBeVisible();
  await page.clock.runFor(400);
  const box = await page.locator(".activity-stamp").boundingBox();
  if (!box) throw Error("card missing");
  await page.locator(".activity-stamp").hover({ position: { x: 20, y: 20 } });
  await page.mouse.down();
  await page.clock.runFor(4000);
  await expect(page.locator(".activity-stamp")).toBeVisible();
  await page.locator(".activity-stamp").dispatchEvent("pointercancel", { pointerId: 1 });
  await page.clock.runFor(2600);
  await expect(page.locator(".activity-stamp")).toHaveCount(0);
});
test("セット保存後の設定は記録入力中に保留し、保存してから開始を表示", async ({ page }) => {
  const f = await fixture(page);
  await navigate(page, "設定");
  await page.getByRole("button", { name: "通知", exact: true }).click();
  await page.getByLabel("開始通知を出すタイミング").selectOption("set");
  await expect(page.getByLabel("開始通知を出すタイミング")).toHaveValue("set");
  await page
    .getByRole("dialog", { name: "通知", exact: true })
    .getByRole("button", { name: "閉じる", exact: true })
    .click();
  await startTraining(page);
  f.receive([event(1, "start")]);
  await page.clock.runFor(2100);
  await expect(page.locator(".activity-start")).toHaveCount(0);
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await page.clock.runFor(2100);
  await expect(page.locator(".activity-start")).toContainText("1人がトレーニング開始");
});
test("通知設定の保存失敗では元の設定へ戻し、再試行できる", async ({ page }) => {
  await fixture(page);
  let fail = true;
  await page.route("**/api/notifications/settings", (route) =>
    route.fulfill(
      fail ? { status: 503, json: { detail: "再試行" } } : { json: route.request().postDataJSON() },
    ),
  );
  await navigate(page, "設定");
  await page.getByRole("button", { name: "通知", exact: true }).click();
  await page.getByLabel("スタンプ通知", { exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "通知", exact: true }).getByRole("alert"),
  ).toContainText("保存できません");
  await expect(page.getByLabel("スタンプ通知", { exact: true })).toBeChecked();
  fail = false;
  await page.getByLabel("スタンプ通知", { exact: true }).click();
  await expect(page.getByLabel("スタンプ通知", { exact: true })).not.toBeChecked();
});

for (const width of [320, 390, 430])
  test(`${width}px: 採用Aは中央に登場し右へ退場、時計を隠さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const f = await fixture(page);
    f.receive(Array.from({ length: 13 }, (_, i) => event(i + 30, "start")));
    await page.clock.runFor(2400);
    const card = page.locator(".activity-start");
    const box = await card.boundingBox();
    if (!box) throw Error("開始通知がありません");
    expect(box.y + box.height / 2).toBeCloseTo(422, 0);
    const entry = await card.evaluate((el) => {
      const animation = el.getAnimations()[0];
      return {
        duration: animation.effect?.getTiming().duration,
        frames: (animation.effect as KeyframeEffect)?.getKeyframes(),
      };
    });
    expect(entry.duration).toBe(240);
    expect(entry.frames?.[0].transform).toContain("-115%");
    const faces = await page
      .locator(".activity-start-faces")
      .evaluate((el) => ({ width: el.clientWidth, total: el.scrollWidth }));
    expect(faces.total).toBeLessThanOrEqual(faces.width);
    const watch = page.getByTestId("floating-training");
    const point = await watch.boundingBox();
    if (!point) throw Error("時計がありません");
    expect(
      await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest(".floating-training") !== null,
        { x: point.x + point.width / 2, y: point.y + point.height / 2 },
      ),
    ).toBe(true);
    await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2);
    await page.mouse.down();
    await page.mouse.move(point.x + point.width / 2 - 40, box.y + box.height - 12, { steps: 8 });
    await page.mouse.up();
    await expect(card).not.toHaveClass(/activity-start-leave/);
    await page.clock.runFor(100);
    const movedFaces = await page
      .locator(".activity-start-faces")
      .evaluate((el) => ({ width: el.clientWidth, total: el.scrollWidth }));
    expect(movedFaces.total).toBeLessThanOrEqual(movedFaces.width);
    await page.getByRole("banner").click({ position: { x: 10, y: 10 } });
    await expect(card).toHaveClass(/activity-start-leave/);
    const exit = await card.evaluate((el) => {
      const animation = el.getAnimations()[0];
      return {
        duration: animation.effect?.getTiming().duration,
        frames: (animation.effect as KeyframeEffect)?.getKeyframes(),
      };
    });
    expect(exit.duration).toBe(200);
    expect(exit.frames?.at(-1)?.transform).toContain("115%");
    await page.clock.runFor(210);
    await expect(card).toHaveCount(0);
  });

test("記録中は入力ドックより上の中央、動き低減に従う", async ({ page }) => {
  const f = await fixture(page);
  await navigate(page, "設定");
  await page.getByRole("button", { name: "通知", exact: true }).click();
  await page.getByLabel("開始通知を出すタイミング").selectOption("now");
  await page
    .getByRole("dialog", { name: "通知", exact: true })
    .getByRole("button", { name: "閉じる", exact: true })
    .click();
  await startTraining(page);
  f.receive(Array.from({ length: 13 }, (_, i) => event(i + 50, "start")));
  await page.clock.runFor(2400);
  const card = page.locator(".activity-start");
  const box = await card.boundingBox();
  const dock = await page.locator(".recording-entry-dock").boundingBox();
  if (!box || !dock) throw Error("通知か入力ドックがありません");
  expect(box.y + box.height / 2).toBeCloseTo(Math.max(150, (48 + dock.y) / 2), 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.locator(".session-header").click({ position: { x: 10, y: 10 } });
  expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.clock.runFor(210);
  await expect(card).toHaveCount(0);
});
