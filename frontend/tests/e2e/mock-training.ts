import { gunzipSync } from "node:zlib";
import { type Page, expect } from "@playwright/test";
import type { ExerciseOption, TrainingSession } from "../../src/lib/api";

// UI単独の検証用。実際の認証・DB・共有検証はsharing.spec.tsで行う。
export async function mockTraining(page: Page, owner = true, showGuide = false) {
  const user = {
    id: "00000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "ui@example.test",
    user_metadata: { display_name: "画面テスト" },
    app_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const group = {
    id: "00000000-0000-0000-0000-000000000002",
    name: "画面テスト部",
    owner_id: owner ? user.id : "00000000-0000-0000-0000-000000000003",
    invite_code: "ABCDEF123456",
  };
  const state = {
    user,
    group,
    failAuth: false,
    failSync: false,
    failRename: false,
    options: [
      { id: "option-bench", name: "ベンチプレス" },
      { id: "option-squat", name: "スクワット" },
    ] as ExerciseOption[],
    failOptions: false,
    failOptionWrite: false,
    authUpdates: 0,
    syncs: 0,
    session: null as TrainingSession | null,
    finished: [] as TrainingSession[],
    failSave: false,
    saves: 0,
  };
  await page.route("**/auth/v1/**", async (route) => {
    if (route.request().method() === "PUT") {
      state.authUpdates++;
      if (state.failAuth) return route.abort();
      user.user_metadata.display_name = route.request().postDataJSON().data.display_name;
    }
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp: expiresAt })).toString("base64url")}.test-signature`;
    return route.fulfill({
      json: route.request().url().includes("/token")
        ? {
            access_token: token,
            token_type: "bearer",
            expires_in: 3600,
            expires_at: expiresAt,
            refresh_token: "test-refresh",
            user,
          }
        : user,
    });
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/stamps/summary"))
      return route.fulfill({
        json: Object.fromEntries(
          route
            .request()
            .postDataJSON()
            .workout_ids.map((id: string) => [
              id,
              { counts: {}, mine: [], can_send: id !== state.session?.id },
            ]),
        ),
      });
    if (path === "/api/stamps/inbox")
      return route.fulfill({
        json: {
          items: [],
          total: 0,
          people: 0,
          unread: 0,
          can_send: false,
          mine: [],
          has_more: false,
        },
      });
    if (path === "/api/sessions/active") return route.fulfill({ json: state.session });
    if (path === "/api/sessions") {
      state.session ??= {
        id: route.request().postDataJSON().id,
        user_id: user.id,
        display_name: user.user_metadata.display_name,
        group_id: null,
        shared_group_ids: [group.id],
        exercises: [],
        revision: 1,
        performed_on: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
          new Date(),
        ),
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        ended_at: null,
      };
      return route.fulfill({ status: 201, json: state.session });
    }
    if (path.endsWith("/bests"))
      return route.fulfill({ json: { revision: state.session?.revision, sets: [] } });
    if (path.startsWith("/api/sessions/")) {
      if (path.endsWith("/heartbeat")) return route.fulfill({ status: 204 });
      if (!state.session) return route.fulfill({ status: 409, json: { detail: "終了済み" } });
      const body =
        route.request().headers()["content-encoding"] === "gzip"
          ? JSON.parse(gunzipSync(route.request().postDataBuffer() ?? Buffer.alloc(0)).toString())
          : route.request().postDataJSON();
      if (state.failSave) return route.abort();
      if (
        body.expected_revision + 1 === state.session.revision &&
        JSON.stringify(body.exercises) === JSON.stringify(state.session.exercises)
      )
        return route.fulfill({ json: state.session });
      if (body.expected_revision !== state.session.revision)
        return route.fulfill({
          status: 409,
          json: { detail: "別の更新があります。保存済みを読み直してください" },
        });
      if (path.endsWith("/finish")) {
        const ended = {
          ...state.session,
          revision: state.session.revision + 1,
          ended_at: new Date().toISOString(),
        };
        state.finished.push(ended);
        state.session = null;
        return route.fulfill({ json: ended });
      }
      state.saves++;
      const before = state.session.exercises.flatMap((exercise) => exercise.sets);
      const after = (body.exercises as TrainingSession["exercises"]).flatMap(
        (exercise) => exercise.sets,
      );
      const latest = after.at(-1);
      const bestUpdated =
        after.length === before.length + 1 &&
        !!latest &&
        latest.weight > Math.max(80, ...before.map((value) => value.weight));
      state.session = {
        ...state.session,
        exercises: body.exercises,
        best_updated: bestUpdated,
        revision: state.session.revision + 1,
      };
      return route.fulfill({ json: state.session });
    }
    if (path === "/api/exercises/context")
      return route.fulfill({
        json: {
          best_weight: 80,
          best_rm: 101.3,
          previous: {
            id: "previous",
            performed_on: "2026-01-01",
            sets: [
              { weight: 80, reps: 8 },
              { weight: 75, reps: 10 },
            ],
          },
          memo: { content: "", revision: 0 },
        },
      });
    if (path === "/api/exercises/memo")
      return route.fulfill({
        json: { content: route.request().postDataJSON().content, revision: 1 },
      });
    if (path.endsWith("/memo")) return route.fulfill({ json: { content: "", revision: 0 } });
    if (path === `/api/groups/${group.id}/activity`) {
      const latest = state.session?.exercises.length ? state.session : state.finished.at(-1);
      const exercise = latest?.exercises.at(-1);
      const value = exercise?.sets.at(-1);
      return route.fulfill({
        json: {
          group_id: group.id,
          member_count: 1,
          live_count: state.session ? 1 : 0,
          today_count: state.session || state.finished.length ? 1 : 0,
          members: [
            {
              id: user.id,
              display_name: user.user_metadata.display_name,
              live: !!state.session,
              today: !!state.session || !!state.finished.length,
            },
          ],
          feed:
            value && latest && exercise
              ? [
                  {
                    workout_id: latest.id,
                    score: latest.score,
                    user_id: user.id,
                    display_name: user.user_metadata.display_name,
                    exercise: exercise.name,
                    ...value,
                    estimated_rm: null,
                    updated_at: latest.created_at,
                    best: false,
                  },
                ]
              : [],
        },
      });
    }
    if (path === "/api/groups/preview")
      return route.fulfill({ json: { ...group, member_count: 1, already_member: false } });
    if (path === "/api/groups/join") return route.fulfill({ json: group });
    if (path === "/api/exercise-options") {
      if (route.request().method() === "POST") {
        if (state.failOptionWrite) return route.abort();
        const name = route.request().postDataJSON().name.trim();
        const option = state.options.find((item) => item.name === name) ?? {
          id: crypto.randomUUID(),
          name,
          primary_body_part: route.request().postDataJSON().primary_body_part ?? null,
          secondary_body_parts: route.request().postDataJSON().secondary_body_parts ?? [],
          revision: 1,
        };
        if (!state.options.includes(option)) state.options.push(option);
        return route.fulfill({ status: 201, json: option });
      }
      if (state.failOptions) return route.abort();
      return route.fulfill({ json: state.options });
    }
    if (path.startsWith("/api/exercise-options/")) {
      if (state.failOptionWrite) return route.abort();
      if (route.request().method() === "PATCH") {
        const option = state.options.find((item) => item.id === path.split("/").at(-1));
        if (!option)
          return route.fulfill({ status: 404, json: { detail: "種目が見つかりません" } });
        const body = route.request().postDataJSON();
        if (option.revision === undefined || body.expected_revision !== option.revision)
          return route.fulfill({
            status: 409,
            json: { detail: "別の更新があります。最新の部位を読み直してください" },
          });
        Object.assign(option, {
          primary_body_part: body.primary_body_part,
          secondary_body_parts: body.secondary_body_parts,
          revision: option.revision + 1,
        });
        return route.fulfill({ json: option });
      }
      state.options = state.options.filter((item) => item.id !== path.split("/").at(-1));
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/me") {
      return route.fulfill({
        json: { id: user.id, display_name: user.user_metadata.display_name },
      });
    }
    if (path === "/api/me/profile") {
      state.syncs++;
      if (state.failSync) return route.abort();
      return route.fulfill({
        json: { id: user.id, display_name: user.user_metadata.display_name },
      });
    }
    if (path === "/api/groups") return route.fulfill({ json: [group] });
    if (path === `/api/groups/${group.id}`) {
      if (route.request().method() === "PATCH") {
        if (state.failRename) return route.abort();
        group.name = route.request().postDataJSON().name;
        return route.fulfill({ json: group });
      }
      return route.fulfill({
        json: {
          ...group,
          members: [
            {
              id: user.id,
              display_name: user.user_metadata.display_name,
              joined_at: "2026-01-01T00:00:00Z",
            },
          ],
        },
      });
    }
    if (path === "/api/workouts/activity")
      return route.fulfill({
        json: {
          month: new URL(route.request().url()).searchParams.get("month"),
          metric: "volume",
          total_volume: 0,
          total_sets: 0,
          workout_count: 0,
          active_days: 0,
          days: [],
        },
      });
    if (path.endsWith("/workouts"))
      return route.fulfill({
        json: [...(state.session?.exercises.length ? [state.session] : []), ...state.finished],
      });
    return route.fulfill({ status: 404, json: { detail: "UIテスト対象外" } });
  });
  if (!showGuide)
    await page.addInitScript(
      (id) => localStorage.setItem(`gotore:onboarding:v2:${id}`, "seen"),
      user.id,
    );
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill("ui@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("ui-test-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  return state;
}

export async function navigate(page: Page, name: string) {
  await page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
}
export async function openTraining(page: Page) {
  await navigate(page, "ホーム");
  const resume = page.getByRole("button", { name: "トレーニングを再開", exact: true });
  if (await resume.count()) await resume.click();
}
export async function startTraining(page: Page, name = "ベンチプレス") {
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
}
export async function openGroup(page: Page, destination?: "members" | "invite" | "manage") {
  await navigate(page, "ホーム");
  await page
    .getByRole("button", { name: /の詳細$/ })
    .first()
    .click();
  if (destination === "members") await page.getByRole("button", { name: /^メンバー一覧/ }).click();
  if (destination === "invite") await page.getByRole("button", { name: /^メンバーを招待/ }).click();
  if (destination === "manage") await page.getByText("グループを管理", { exact: true }).click();
}
export async function openRecord(page: Page) {
  await navigate(page, "履歴");
  await page.locator(".history-row").first().click();
}

export async function showRecordingMemos(page: Page) {
  const toggle = page.getByRole("button", { name: "メモを常に表示", exact: true });
  if (await toggle.isVisible()) await toggle.click();
}

export async function expectRecordingBest(page: Page, value: string) {
  const focused = (await page.locator(":focus").count())
    ? await page.locator(":focus").elementHandle()
    : null;
  await page.locator(".exercise-information").click();
  await expect(page.locator(".personal-bests")).toContainText(value);
  await page
    .getByRole("dialog", { name: "種目情報", exact: true })
    .getByRole("button", { name: "閉じる", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "種目情報", exact: true })).toHaveCount(0);
  if (focused && (await focused.evaluate((element) => element.isConnected))) await focused.focus();
}

export async function openRecordingCatalog(page: Page) {
  if (!(await page.getByRole("button", { name: "種目一覧", exact: true }).isVisible()))
    await page.locator(".exercise-information").click();
  await page.getByRole("button", { name: "種目一覧", exact: true }).click();
}
