import { setDemoEnvironment } from "@/lib/demo-environment";
import { clearRecordSnapshot } from "@/lib/record-snapshot";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createSessionId } from "../session/session-id";
import { type DemoState, DemoStore } from "./demo-store";
const key = "egotore:demo:v1";
let store: DemoStore;
function persist() {
  sessionStorage.setItem(key, JSON.stringify(store.state));
}
export function prepareDemo() {
  let state: DemoState | undefined;
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) {
      const value = JSON.parse(saved);
      if (
        typeof value?.userId === "string" &&
        value.userId.startsWith("demo-") &&
        typeof value.name === "string" &&
        [value.groups, value.options, value.records, value.notices, value.seen].every(
          Array.isArray,
        ) &&
        value.settings &&
        value.memos &&
        value.stamps &&
        value.avatar
      )
        state = value;
    }
  } catch {
    /* 保存が壊れたときは架空データから再開する。 */
  }
  store = new DemoStore(state?.userId || `demo-${createSessionId()}`, state);
  const session: Session = {
    access_token: "demo-only",
    refresh_token: "demo-only",
    token_type: "bearer",
    expires_in: 3600,
    user: {
      id: store.state.userId,
      aud: "demo",
      role: "demo",
      email: "demo@example.invalid",
      app_metadata: {},
      user_metadata: { display_name: store.state.name },
      created_at: new Date().toISOString(),
    },
  };
  // デモ画面で使うAuth操作だけを端末内で扱い、本番のSupabaseへ接続しない。
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      updateUser: async ({ data }: { data: { display_name: string } }) => {
        store.state.name = data.display_name;
        session.user.user_metadata.display_name = data.display_name;
        for (const r of store.state.records)
          if (r.user_id === store.state.userId) r.display_name = data.display_name;
        persist();
        return { data: { user: session.user }, error: null };
      },
      signOut: async () => {
        await resetDemo();
        return { error: null };
      },
    },
  } as unknown as SupabaseClient;
  setDemoEnvironment({
    session,
    client,
    request: async <T>(path: string, options: RequestInit) => {
      const result = await store.request(path, options);
      persist();
      return result as T;
    },
  });
  localStorage.setItem(`gotore:onboarding:v2:${session.user.id}`, "seen");
  persist();
  return session;
}
export function receiveDemo(kind: "stamp" | "start", count: number) {
  store.receive(kind, count);
  persist();
  window.dispatchEvent(new Event("demo-notifications"));
}
export async function resetDemo() {
  await clearRecordSnapshot(store.state.userId);
  // デモの利用者IDに属する端末保存だけを消す。ログイン済み利用者の保存には触れない。
  for (const item of Object.keys(localStorage))
    if (
      (item.startsWith("gotore:") || item.startsWith("egotore:")) &&
      item.includes(store.state.userId)
    )
      localStorage.removeItem(item);
  sessionStorage.removeItem(key);
  window.location.reload();
}
