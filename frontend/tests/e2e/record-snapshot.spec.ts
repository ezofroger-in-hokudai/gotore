import { expect, test } from "./fixtures";
import { mockTraining, startTraining } from "./mock-training";

test("端末に保存した前回値を通信前に表示する", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
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
  await page.route("**/api/history/summary", async (route) => {
    await gate;
    await route.fulfill({ status: 503, json: { detail: "集計を取得できません" } });
  });
  await page.route("**/api/workouts/activity?*", async (route) => {
    await gate;
    await route.fulfill({ status: 503, json: { detail: "カレンダーを取得できません" } });
  });
  await page.route("**/api/analytics?*", async (route) => {
    await gate;
    await route.fulfill({ status: 503, json: { detail: "グラフを取得できません" } });
  });
  try {
    await page.reload();
    await page.getByRole("navigation").getByRole("button", { name: "履歴", exact: true }).click();
    await expect(page.locator(".personal-history-summary")).toContainText("500");
    await expect(page.locator(".personal-history-days button").nth(27)).toContainText("500kg");
    await page.locator(".personal-history-days button").nth(27).click();
    await expect(page.getByRole("table", { name: "端末の履歴種目" })).toBeVisible();
    await page.getByRole("button", { name: "閉じる" }).click();
    await page.getByRole("tab", { name: "グラフ" }).click();
    await expect(page.locator(".personal-history-graph-value strong")).toContainText("500");
    await startTraining(page);
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("62.5");
    await expect(page.getByRole("spinbutton", { name: "回数", exact: true })).toHaveValue("8");
    await expect(page.getByRole("button", { name: "種目メモを編集" })).toContainText(
      "端末の種目メモ",
    );
    await page.getByRole("navigation").getByRole("button", { name: "履歴", exact: true }).click();
    await expect(page.locator(".personal-history-summary")).toContainText("500");
    await expect(page.locator(".personal-history-graph-value strong")).toContainText("500");
    expect(fullFetches).toBe(0);
  } finally {
    release();
  }
});

test("同じ日の51件も端末から通信前に表示する", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
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
          workouts: Array.from({ length: 51 }, (_, index) => ({
            id: `cached-${index}`,
            user_id: userId,
            display_name: "本人",
            group_id: null,
            performed_on: "2026-09-28",
            created_at: `2026-09-28T${String(index % 24).padStart(2, "0")}:00:00Z`,
            revision: 1,
            exercises: [{ name: `種目${index + 1}`, sets: [{ weight: 10, reps: 1 }] }],
          })),
          options: [],
          contexts: {},
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
  await page.route("**/api/me/record-snapshot/changes", async (route) => {
    await gate;
    await route.abort();
  });
  await page.route("**/api/workouts?*", async (route) => {
    await gate;
    await route.fulfill({ json: [] });
  });
  try {
    await page.reload();
    await page.getByRole("navigation").getByRole("button", { name: "履歴", exact: true }).click();
    await page.locator(".personal-history-days button").filter({ hasText: "28" }).click();
    await expect(page.locator(".record-review")).toHaveCount(51);
    await expect(page.getByRole("heading", { name: "種目51" })).toBeVisible();
  } finally {
    release();
  }
});

test("認証が失効したら端末の日別記録を隠す", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
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
              id: "cached",
              user_id: userId,
              display_name: "本人",
              group_id: null,
              performed_on: "2026-09-28",
              created_at: "2026-09-28T03:00:00Z",
              revision: 1,
              exercises: [{ name: "非表示にする記録", sets: [{ weight: 10, reps: 1 }] }],
            },
          ],
          options: [],
          contexts: {},
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
  await page.route("**/api/workouts?*", async (route) => {
    await gate;
    await route.fulfill({ status: 401, json: { detail: "ログインし直してください。" } });
  });
  try {
    await page.reload();
    await page.getByRole("navigation").getByRole("button", { name: "履歴", exact: true }).click();
    await page.locator(".personal-history-days button").filter({ hasText: "28" }).click();
    await expect(page.getByRole("table", { name: "非表示にする記録" })).toBeVisible();
    release();
    await expect(page.getByRole("table", { name: "非表示にする記録" })).toHaveCount(0);
    await expect(page.locator(".v2-app").getByRole("alert")).toContainText("ログインし直して");
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

test("壊れた端末記録は読み込まず、サーバーから取り直す", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
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
              id: "broken",
              user_id: userId,
              performed_on: "2026-01-01",
              created_at: "2026-01-01T00:00:00Z",
              revision: 1,
              exercises: [null],
            },
          ],
          options: [],
          contexts: {},
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
  let fullFetches = 0;
  await page.route("**/api/me/record-snapshot", async (route) => {
    fullFetches++;
    await route.fallback();
  });
  await page.reload();
  await expect.poll(() => fullFetches).toBeGreaterThan(0);
  await page.getByRole("navigation").getByRole("button", { name: "履歴", exact: true }).click();
  await page.locator(".personal-history-days button").nth(27).click();
  await expect(page.locator(".record-review")).toHaveCount(0);
});

test("別端末の追加・削除を差分で履歴と端末保存へ反映する", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
  const state = await mockTraining(page);
  const today = "2026-09-28";
  const original = {
    id: "cached-old",
    user_id: state.user.id,
    display_name: "画面テスト",
    group_id: null,
    performed_on: today,
    created_at: new Date().toISOString(),
    revision: 1,
    exercises: [{ name: "削除前の種目", sets: [{ weight: 50, reps: 5 }] }],
    best_sets: [],
    shared_group_ids: [],
  };
  await page.evaluate(
    async ({ userId, record }) => {
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
            workouts: [record],
            options: [],
            contexts: {
              削除前の種目: {
                best_weight: 50,
                best_rm: 58.33,
                previous: {
                  id: record.id,
                  performed_on: record.performed_on,
                  sets: record.exercises[0].sets,
                },
                memo: { content: "古いメモ", revision: 1 },
              },
            },
            workout_memos: { [record.id]: { content: "削除する記録", revision: 1 } },
            session_exercise_memos: {},
          },
          userId,
        );
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
    { userId: state.user.id, record: original },
  );
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const added = {
    ...original,
    id: "server-new",
    exercises: [{ name: "追加後の種目", sets: [{ weight: 70, reps: 7 }] }],
  };
  await page.route("**/api/me/record-snapshot/changes", async (route) => {
    await gate;
    await route.fulfill({
      json: {
        version: 1,
        user_id: state.user.id,
        workouts: [added],
        deleted_workout_ids: [original.id],
        options: [],
        deleted_option_ids: [],
        contexts: {},
        deleted_context_names: ["削除前の種目"],
        workout_memos: {},
        deleted_workout_memo_ids: [original.id],
        session_exercise_memos: {},
        deleted_session_exercise_memos: {},
      },
    });
  });
  await page.route("**/api/workouts?*", async (route) => {
    await gate;
    await route.fulfill({ json: [added] });
  });
  await page.route("**/api/history/summary", async (route) => {
    await route.fulfill({
      json: {
        workout_count: 1,
        total_sets: 1,
        total_volume: 250,
        first_performed_on: today,
        exercises: [{ name: "削除前の種目", body_part: "other", last_performed_on: today }],
      },
    });
  });
  await page.route("**/api/workouts/activity?*", async (route) => {
    await route.fulfill({
      json: {
        month: "2026-09",
        metric: "volume",
        total_volume: 250,
        total_sets: 1,
        workout_count: 1,
        active_days: 1,
        days: [{ date: today, volume: 250, set_count: 1, workout_count: 1 }],
      },
    });
  });
  try {
    await page.reload();
    await page.getByRole("navigation").getByRole("button", { name: "履歴", exact: true }).click();
    await expect(page.locator(".personal-history-summary")).toContainText("250");
    await expect(page.locator(".personal-history-days button").nth(27)).toContainText("250kg");
    await page.locator(".personal-history-days button").nth(27).click();
    await expect(page.getByRole("table", { name: "削除前の種目" })).toBeVisible();
    release();
    await expect(page.locator(".personal-history-summary")).toContainText("490");
    await expect(page.locator(".personal-history-days button").nth(27)).toContainText("490kg");
    await expect(page.getByRole("table", { name: "追加後の種目" })).toBeVisible();
    await expect(page.getByRole("table", { name: "削除前の種目" })).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(async (userId) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("gotore-record-snapshot", 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const saved = await new Promise<Record<string, unknown>>((resolve, reject) => {
            const request = database
              .transaction("users", "readonly")
              .objectStore("users")
              .get(userId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          database.close();
          return {
            ids: (saved.workouts as { id: string }[]).map((record) => record.id),
            contextNames: Object.keys(saved.contexts as object),
            memoIds: Object.keys(saved.workout_memos as object),
          };
        }, state.user.id),
      )
      .toEqual({ ids: ["server-new"], contextNames: [], memoIds: [] });
  } finally {
    release();
  }
});
