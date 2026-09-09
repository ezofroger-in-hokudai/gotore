import type { AvatarImage } from "@/lib/api";
import { useEffect, useState } from "react";
import { AvatarPanel } from "../settings/avatar-panel";
import { SettingsPanel } from "../settings/settings-panel";
import { useResource } from "../training/use-resource";
import { Sheet } from "./sheet";

type Theme = "system" | "light" | "dark";
export function usePreferences(userId: string) {
  const [theme, setTheme] = useState<Theme>("system");
  const [haptic, setHaptic] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const key = `gotore:preferences:v2:${userId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      if (["system", "light", "dark"].includes(saved.theme)) setTheme(saved.theme);
      if (typeof saved.haptic === "boolean") setHaptic(saved.haptic);
    } catch {
      setError("端末の設定を読み込めませんでした。");
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(key, JSON.stringify({ theme, haptic }));
    } catch {
      setError("設定を端末に保存できませんでした。");
    }
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme, haptic, ready, key]);
  return { theme, setTheme, haptic, setHaptic, error };
}

export function Preferences({
  preferences,
  onChanged,
  onGuide,
  onLogout,
  signingOut,
}: {
  preferences: ReturnType<typeof usePreferences>;
  onChanged: () => void;
  onGuide: () => void;
  onLogout: () => void;
  signingOut: boolean;
}) {
  const [sheet, setSheet] = useState<"name" | "avatar" | "theme" | "haptic" | null>(null);
  const profile = useResource<{ display_name: string }>("/me");
  const avatar = useResource<AvatarImage>("/me/avatar");
  return (
    <section className="preferences">
      <h1>設定</h1>
      <h2>アカウント</h2>
      <div className="v2-rows">
        <button className="v2-row" type="button" onClick={() => setSheet("avatar")}>
          <span>プロフィール画像</span>
          <span className="settings-avatar-row">
            <span className="person-avatar" aria-hidden="true">
              {avatar.data?.data_url ? (
                <img src={avatar.data.data_url} alt="" width={256} height={256} />
              ) : (
                <span className="avatar-initial">
                  {Array.from(profile.data?.display_name || "")[0]}
                </span>
              )}
            </span>{" "}
            ›
          </span>
        </button>
        <button className="v2-row" type="button" onClick={() => setSheet("name")}>
          <span>表示名</span>
          <span>{profile.data?.display_name} ›</span>
        </button>
      </div>
      <h2>アプリ</h2>
      <div className="v2-rows">
        <div className="v2-row">
          <span>通知</span>
          <span className="muted">準備中</span>
        </div>
        <button className="v2-row" type="button" onClick={() => setSheet("theme")}>
          <span>外観</span>
          <span>
            {{ system: "端末に合わせる", light: "ライト", dark: "ダーク" }[preferences.theme]} ›
          </span>
        </button>
        <button className="v2-row" type="button" onClick={() => setSheet("haptic")}>
          <span>触覚フィードバック</span>
          <span>{preferences.haptic ? "オン" : "オフ"} ›</span>
        </button>
      </div>
      <h2>サポート</h2>
      <div className="v2-rows">
        <button className="v2-row" type="button" onClick={onGuide}>
          使い方 <span>›</span>
        </button>
        <button className="v2-row" type="button" disabled={signingOut} onClick={onLogout}>
          {signingOut ? "処理中…" : "ログアウト"}
        </button>
      </div>
      {preferences.error && (
        <p className="error" role="alert">
          {preferences.error}
        </p>
      )}
      {sheet && (
        <Sheet
          title={
            sheet === "avatar"
              ? "プロフィール画像"
              : sheet === "name"
                ? "表示名"
                : sheet === "theme"
                  ? "外観"
                  : "触覚フィードバック"
          }
          onClose={() => setSheet(null)}
        >
          {sheet === "avatar" ? (
            <AvatarPanel
              name={profile.data?.display_name || ""}
              onSaved={() => {
                avatar.retry();
                onChanged();
              }}
              onClose={() => setSheet(null)}
            />
          ) : sheet === "name" ? (
            <SettingsPanel
              onSaved={() => {
                profile.retry();
                onChanged();
              }}
            />
          ) : sheet === "theme" ? (
            <div className="v2-rows">
              {(["system", "light", "dark"] as const).map((theme) => (
                <button
                  className="v2-row"
                  type="button"
                  key={theme}
                  aria-pressed={preferences.theme === theme}
                  onClick={() => preferences.setTheme(theme)}
                >
                  <span>
                    {
                      {
                        system: "端末に合わせる",
                        light: "ライト",
                        dark: "ダーク",
                      }[theme]
                    }
                  </span>
                  {preferences.theme === theme && <span>✓</span>}
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="muted">
                セットを保存したときに軽く振動します。対応する端末・ブラウザで利用できます。
              </p>
              <label className="haptic-toggle">
                <input
                  type="checkbox"
                  checked={preferences.haptic}
                  onChange={(e) => preferences.setHaptic(e.target.checked)}
                />
                触覚フィードバックを使う
              </label>
            </>
          )}
        </Sheet>
      )}
    </section>
  );
}
