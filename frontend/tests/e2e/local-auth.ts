import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

export const testPassword = "Gotore-test-2026!";

export function localAuth() {
  // 管理キーはローカルCLIからテストプロセス内だけで取得し、ブラウザやログに渡さない。
  const result = spawnSync("bunx", ["supabase@2.107.0", "status", "-o", "json"], {
    cwd: resolve(__dirname, "../../.."),
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) throw new Error("ローカルSupabaseを起動してください。");
  const data = JSON.parse(result.stdout);
  const url = new URL(data.API_URL);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "59321" ||
    url.protocol !== "http:"
  ) {
    throw new Error("アカウント作成テストはGO TOREのローカルSupabase専用です。");
  }
  if (!data.SERVICE_ROLE_KEY || !data.ANON_KEY) throw new Error("ローカルAuthキーがありません。");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    admin: createClient(url.origin, data.SERVICE_ROLE_KEY, options).auth.admin,
    publicAuth: createClient(url.origin, data.ANON_KEY, options).auth,
  };
}

export async function createTestUser(name: string, email: string) {
  const { admin } = localAuth();
  const { error } = await admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) throw new Error(`テスト用アカウントを作成できません: ${error.code}`);
}
