import { type Page, expect } from "@playwright/test";

// UI単独の検証用。実際の認証・DB・共有検証はsharing.spec.tsで行う。
export async function mockTraining(page: Page, owner = true) {
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
    ],
    failOptions: false,
    failOptionWrite: false,
    authUpdates: 0,
    syncs: 0,
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
    if (path === "/api/exercise-options") {
      if (route.request().method() === "POST") {
        if (state.failOptionWrite) return route.abort();
        const name = route.request().postDataJSON().name.trim();
        const option = state.options.find((item) => item.name === name) ?? {
          id: crypto.randomUUID(),
          name,
        };
        if (!state.options.includes(option)) state.options.push(option);
        return route.fulfill({ status: 201, json: option });
      }
      if (state.failOptions) return route.abort();
      return route.fulfill({ json: state.options });
    }
    if (path.startsWith("/api/exercise-options/")) {
      if (state.failOptionWrite) return route.abort();
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
          members: [{ id: user.id, display_name: user.user_metadata.display_name }],
        },
      });
    }
    if (path.endsWith("/workouts")) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { detail: "UIテスト対象外" } });
  });
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill("ui@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("ui-test-password");
  await page.getByRole("button", { name: "ログインする →", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  return state;
}
