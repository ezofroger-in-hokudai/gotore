import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

test("端末に保存した前回値を通信前に表示する", async ({ page }) => {
  const state = await mockTraining(page);
  await page.evaluate(async (userId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("gotore-record-snapshot", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("users", "readwrite");
      transaction.objectStore("users").put(
        {
          version: 1,
          user_id: userId,
          workouts: [
            {
              id: "cached-history",
              user_id: userId,
              display_name: "画面テスト",
              group_id: null,
              performed_on: new Date().toISOString().slice(0, 10),
              created_at: new Date().toISOString(),
              revision: 1,
              exercises: [{ name: "端末の履歴種目", sets: [{ weight: 62.5, reps: 8 }] }],
              best_sets: [],
              shared_group_ids: [],
            },
          ],
          options: [
            { id: "option-bench", name: "ベンチプレス" },
            { id: "option-squat", name: "スクワット" },
          ],
          contexts: {
            ベンチプレス: {
              best_weight: 62.5,
              best_rm: 79.2,
              previous: {
                id: "previous",
                performed_on: "2026-01-01",
                sets: [{ weight: 62.5, reps: 8 }],
              },
              memo: { content: "端末の種目メモ", revision: 1 },
            },
          },
          workout_memos: {},
          session_exercise_memos: {},
        },
        userId,
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, state.user.id);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fullFetches = 0;
  await page.route("**/api/me/record-snapshot", async (route) => {
    fullFetches++;
    await route.fallback();
  });
  await page.route("**/api/me/record-snapshot/changes", async (route) => {
    await gate;
    await route.fulfill({
      json: {
        version: 1,
        user_id: state.user.id,
        workouts: [],
        deleted_workout_ids: [],
        options: [],
        deleted_option_ids: [],
        contexts: {},
        deleted_context_names: [],
        workout_memos: {},
        deleted_workout_memo_ids: [],
        session_exercise_memos: {},
        deleted_session_exercise_memos: {},
      },
    });
  });
  await page.route("**/api/exercises/context?*", async (route) => {
    await gate;
    await route.fulfill({
      json: {
        best_weight: 62.5,
        best_rm: 79.2,
        previous: { id: "previous", performed_on: "2026-01-01", sets: [{ weight: 62.5, reps: 8 }] },
        memo: { content: "端末の種目メモ", revision: 1 },
      },
    });
  });
  await page.route("**/api/workouts?*", async (route) => {
    await gate;
    await route.fulfill({ json: [] });
  });
  try {
    await page.reload();
    await page.getByRole("navigation").getByRole("button", { name: "履歴", exact: true }).click();
    await expect(page.locator(".history-row").getByText("端末の履歴種目")).toBeVisible();
    await startTraining(page);
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("62.5");
    await expect(page.getByRole("spinbutton", { name: "回数", exact: true })).toHaveValue("8");
    await expect(page.getByRole("button", { name: "種目メモを編集" })).toContainText(
      "端末の種目メモ",
    );
    expect(fullFetches).toBe(0);
  } finally {
    release();
  }
});

test("別アカウントの端末記録は前回値に使用しない", async ({ page }) => {
  await mockTraining(page);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("gotore-record-snapshot", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("users", "readwrite");
      transaction.objectStore("users").put(
        {
          version: 1,
          user_id: "different-user",
          workouts: [],
          options: [],
          contexts: {
            ベンチプレス: {
              previous: {
                id: "other",
                performed_on: "2026-01-01",
                sets: [{ weight: 200, reps: 1 }],
              },
              memo: { content: "他人のメモ", revision: 1 },
            },
          },
          workout_memos: {},
          session_exercise_memos: {},
        },
        "different-user",
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/exercises/context?*", async (route) => {
    await gate;
    await route.fulfill({
      json: {
        best_weight: null,
        best_rm: null,
        previous: null,
        memo: { content: "", revision: 0 },
      },
    });
  });
  try {
    await page.reload();
    await startTraining(page);
    await expect(page.getByText("前回の記録を確認中…")).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toBeHidden();
    await expect(page.getByText("他人のメモ")).toHaveCount(0);
  } finally {
    release();
  }
});
