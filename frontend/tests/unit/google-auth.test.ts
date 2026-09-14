import assert from "node:assert/strict";
import { test } from "node:test";
import {
  googleCallbackError,
  googleSignInOptions,
  needsGoogleDisplayName,
} from "../../src/features/auth/google-auth";

test("Googleは基本権限だけを要求し、戻り先を同じサイトに固定する", () => {
  const request = googleSignInOptions("https://egotore.com");
  assert.deepEqual(request, {
    provider: "google",
    options: {
      redirectTo: "https://egotore.com/auth/callback",
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
    },
  });
  assert.equal(
    googleSignInOptions("http://127.0.0.1:3100").options.redirectTo,
    "http://127.0.0.1:3100/auth/callback",
  );
});

test("認証の拒否と失敗を案内し、外部由来の詳細を表示に使わない", () => {
  assert.match(
    googleCallbackError(
      "https://egotore.com/auth/callback#error=access_denied&error_description=SECRET",
    ) ?? "",
    /キャンセル/,
  );
  assert.match(
    googleCallbackError(
      "https://egotore.com/auth/callback?error=server_error&error_description=SECRET",
    ) ?? "",
    /完了できません/,
  );
  assert.equal(googleCallbackError("https://egotore.com/auth/callback#access_token=token"), null);
});

test("Googleの名前/写真を共有名にせず、既存の表示名とメールログインを維持する", () => {
  const user = (providers: string[], metadata: Record<string, unknown>) => ({
    app_metadata: { providers },
    user_metadata: metadata,
  });
  assert.equal(needsGoogleDisplayName(user(["google"], { full_name: "本名" })), true);
  assert.equal(
    needsGoogleDisplayName(user(["email", "google"], { display_name: "既存名" })),
    false,
  );
  assert.equal(needsGoogleDisplayName(user(["email"], {})), false);
  for (const value of [null, 123, "  ", "名".repeat(21)]) {
    assert.equal(needsGoogleDisplayName(user(["google"], { display_name: value })), true);
  }
});
