import type { Provider, User } from "@supabase/supabase-js";

export function googleSignInOptions(origin: string) {
  return {
    provider: "google" as Provider,
    options: {
      redirectTo: new URL("/auth/callback", origin).href,
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
    },
  };
}

export function googleCallbackError(href: string): string | null {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const error = hash.get("error") || url.searchParams.get("error");
  if (!error) return null;
  return error === "access_denied"
    ? "Googleでのログインがキャンセルされました。もう一度お試しください。"
    : "Googleでのログインを完了できません。もう一度お試しください。";
}

export function needsGoogleDisplayName(user: Pick<User, "app_metadata" | "user_metadata">) {
  const providers = user.app_metadata.providers;
  const google =
    user.app_metadata.provider === "google" ||
    (Array.isArray(providers) && providers.includes("google"));
  const name = user.user_metadata.display_name;
  return (
    google && (typeof name !== "string" || !name.trim() || Array.from(name.trim()).length > 20)
  );
}
