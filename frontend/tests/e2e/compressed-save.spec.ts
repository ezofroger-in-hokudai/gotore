import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import type { TrainingSession } from "../../src/lib/api";
import { createTestUser, testPassword } from "./local-auth";
import { mockTraining, navigate, startTraining } from "./mock-training";

const exercises = [
  { name: "ベンチプレス", sets: Array.from({ length: 20 }, () => ({ weight: 82.5, reps: 8 })) },
  { name: "スクワット", sets: Array.from({ length: 20 }, () => ({ weight: 100, reps: 10 })) },
];

test("圧縮保存が実APIへ届き、応答を失っても再送で二重追加せず再開できる", async ({ page }) => {
  const email = `gotore-gzip-${crypto.randomUUID()}@example.test`;
  await createTestUser("圧縮保存テスト", email);
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "スキップ", exact: true }).click();
  const started = page.waitForResponse(
    (r) => r.url().endsWith("/api/sessions") && r.status() === 201,
  );
  await startTraining(page);
  const startResponse = await started;
  const session: TrainingSession = await startResponse.json();
  const seeded = await page.request.patch(`/api/sessions/${session.id}`, {
    headers: { Authorization: startResponse.request().headers().authorization },
    data: { expected_revision: session.revision, exercises },
  });
  expect(seeded.status()).toBe(200);
  const saved: TrainingSession = await seeded.json();
  await page.reload();
  await navigate(page, "記録");
  const payloads: unknown[] = [];
  await page.route(`**/api/sessions/${session.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    expect(route.request().headers()["content-encoding"]).toBe("gzip");
    const bytes = route.request().postDataBuffer();
    if (!bytes) throw new Error("本文なし");
    const json = gunzipSync(bytes);
    expect(bytes.length).toBeLessThan(json.length / 2);
    payloads.push(JSON.parse(json.toString()));
    if (payloads.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      return route.abort();
    }
    return route.continue();
  });
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("87.5");
  await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("8");
  const acknowledged = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.status() === 200,
  );
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("未送信");
  const response: TrainingSession = await (await acknowledged).json();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toEqual(payloads[1]);
  expect(response.revision).toBe(saved.revision + 1);
  expect(response.exercises).toEqual([
    { ...exercises[0], sets: [...exercises[0].sets, { weight: 87.5, reps: 8 }] },
    exercises[1],
  ]);
  await page.reload();
  await navigate(page, "記録");
  await expect(page.getByRole("button", { name: "セット21を編集", exact: true })).toContainText(
    "87.5",
  );
});

for (const unsupported of ["browser", "api"] as const) {
  test(`${unsupported}が圧縮未対応でも通常形式で保存できる`, async ({ page }) => {
    if (unsupported === "browser")
      await page.addInitScript(() => {
        Object.defineProperty(window, "CompressionStream", { value: undefined });
      });
    const state = await mockTraining(page);
    await startTraining(page);
    if (!state.session) throw new Error("開始失敗");
    state.session.exercises = structuredClone(exercises);
    state.session.revision++;
    await page.reload();
    await navigate(page, "記録");
    const encodings: (string | undefined)[] = [];
    await page.route(`**/api/sessions/${state.session.id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      const encoding = route.request().headers()["content-encoding"];
      encodings.push(encoding);
      if (encoding)
        return route.fulfill({
          status: 400,
          json: { detail: "There was an error parsing the body" },
        });
      return route.fallback();
    });
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await expect.poll(() => state.saves).toBe(1);
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await expect.poll(() => state.saves).toBe(2);
    expect(encodings).toEqual(
      unsupported === "api" ? ["gzip", undefined, undefined] : [undefined, undefined],
    );
    expect(state.session.exercises[0].sets).toHaveLength(22);
  });
}
