import { isDemoMode } from "@/features/demo/mode";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { getDemoEnvironment } from "./demo-environment";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (isDemoMode()) return getDemoEnvironment().client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key);
  return client;
}
