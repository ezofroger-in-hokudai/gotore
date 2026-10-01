import { useEffect, useState } from "react";
import { CatalogPanel } from "../exercises/catalog-panel";
import type { useExerciseCatalog } from "../exercises/use-exercise-catalog";
import { AvatarPanel } from "../settings/avatar-panel";
import { SettingsPanel } from "../settings/settings-panel";
import { SuggestionBox, useSuggestionBox } from "../settings/suggestion-box";
import type { SettingsProfile } from "../settings/use-settings-profile";
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
  resources,
  catalog,
  preferences,
  onChanged,
  onGuide,
  onLogout,
  signingOut,
}: {
  resources: SettingsProfile;
  catalog: ReturnType<typeof useExerciseCatalog>;
  preferences: ReturnType<typeof usePreferences>;
  onChanged: () => void;
  onGuide: () => void;
  onLogout: () => void;
  signingOut: boolean;
}) {
  const [sheet, setSheet] = useState<
    "name" | "avatar" | "theme" | "exercises" | "suggestion" | "logout" | null
  >(null);
  const suggestion = useSuggestionBox();
  const { profile, avatar } = resources;
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
      <h2>トレーニング</h2>
      <div className="v2-rows">
        <button
          className="v2-row"
          type="button"
          aria-label="種目を管理"
          data-tour="exercises"
          onClick={() => setSheet("exercises")}
        >
          <span>種目</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <h2>アプリ</h2>
      <div className="v2-rows">
        <button className="v2-row" type="button" onClick={() => setSheet("theme")}>
          <span>外観</span>
          <span>
            {{ system: "端末に合わせる", light: "ライト", dark: "ダーク" }[preferences.theme]} ›
          </span>
        </button>
        <label className="v2-row haptic-setting">
          <span>触覚フィードバック</span>
          <span className="haptic-value">
            <span aria-hidden="true">{preferences.haptic ? "オン" : "オフ"}</span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={preferences.haptic}
              aria-label="触覚フィードバック"
              aria-describedby="haptic-description"
              checked={preferences.haptic}
              onChange={(event) => preferences.setHaptic(event.target.checked)}
            />
          </span>
        </label>
        <p className="muted haptic-description" id="haptic-description">
          セット保存時に軽く振動します。対応する端末・ブラウザで利用できます。
        </p>
      </div>
      <h2>サポート</h2>
      <div className="v2-rows">
        <button
          className="v2-row"
          type="button"
          aria-label="目安箱"
          onClick={() => setSheet("suggestion")}
        >
          <span>目安箱</span>
          <span aria-hidden="true">›</span>
        </button>
        <button className="v2-row" type="button" data-tour="replay" onClick={onGuide}>
          使い方 <span>›</span>
        </button>
        <button
          className="v2-row logout-row"
          type="button"
          disabled={signingOut}
          onClick={() => setSheet("logout")}
        >
          {signingOut ? "処理中…" : "ログアウト"}
        </button>
      </div>
      {preferences.error && (
        <p className="error" role="alert">
          {preferences.error}
        </p>
      )}
      {sheet && sheet !== "logout" && (
        <Sheet
          title={
            sheet === "suggestion"
              ? "目安箱"
              : sheet === "exercises"
                ? "種目一覧"
                : sheet === "avatar"
                  ? "プロフィール画像"
                  : sheet === "name"
                    ? "表示名"
                    : sheet === "theme"
                      ? "外観"
                      : "触覚フィードバック"
          }
          onClose={() => setSheet(null)}
          dismissOnBackdrop={sheet !== "exercises" && sheet !== "avatar" && sheet !== "name"}
        >
          {sheet === "suggestion" ? (
            <SuggestionBox state={suggestion} />
          ) : sheet === "exercises" ? (
            <CatalogPanel catalog={catalog} />
          ) : sheet === "avatar" ? (
            <AvatarPanel
              current={avatar}
              name={profile.data?.display_name || ""}
              onSaved={(saved) => {
                avatar.updateData(() => saved);
                onChanged();
              }}
              onClose={() => setSheet(null)}
            />
          ) : sheet === "name" ? (
            <SettingsPanel
              profile={profile}
              onSaved={(displayName) => {
                profile.updateData((current) => ({ ...current, display_name: displayName }));
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
          ) : null}
        </Sheet>
      )}
      {sheet === "logout" && (
        <Sheet
          title="ログアウト"
          onClose={() => {
            if (!signingOut) setSheet(null);
          }}
          dismissOnBackdrop={!signingOut}
        >
          <p>ログアウトしますか？</p>
          <div className="settings-confirm-actions">
            <button
              className="secondary"
              type="button"
              disabled={signingOut}
              onClick={() => setSheet(null)}
            >
              キャンセル
            </button>
            <button className="danger" type="button" disabled={signingOut} onClick={onLogout}>
              {signingOut ? "処理中…" : "ログアウト"}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
