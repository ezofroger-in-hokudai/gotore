import { getSupabase } from "./supabase";

export type Group = { id: string; name: string; owner_id: string; invite_code: string };
export type GroupDetail = Group & { members: { id: string; display_name: string }[] };
export type Exercise = { name: string; sets: { weight: number; reps: number }[] };
export type Workout = {
  id: string;
  user_id: string;
  display_name: string;
  group_id: string | null;
  performed_on: string;
  exercises: Exercise[];
  created_at: string;
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const client = getSupabase();
  if (!client) throw new Error("ログインの準備ができていません。");
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error("ログインし直してください。");
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
        ...options.headers,
      },
    });
  } catch {
    throw new Error("通信できませんでした。接続を確認して再試行してください。");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body?.detail === "string" ? body.detail : null;
    throw new Error(
      message ??
        (response.status === 422
          ? "入力内容を確認してください。重量は小数1桁まで、回数は1以上の整数です。"
          : "データを取得できませんでした。時間をおいて再試行してください。"),
    );
  }
  return body as T;
}
