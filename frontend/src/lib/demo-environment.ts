import type { Session, SupabaseClient } from "@supabase/supabase-js";
export type DemoEnvironment = {
  session: Session;
  client: SupabaseClient;
  request: <T>(path: string, options: RequestInit) => Promise<T>;
};
let environment: DemoEnvironment | null = null;
export function setDemoEnvironment(value: DemoEnvironment) {
  environment = value;
}
export function getDemoEnvironment() {
  if (!environment) throw new Error("デモを準備しています。");
  return environment;
}
