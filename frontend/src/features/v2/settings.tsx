import { useEffect, useState } from "react";
import { NotificationSettingsPanel } from "../notifications/notification-settings";
import type { useNotifications } from "../notifications/use-notifications";
import { NumberWheel } from "../session/number-wheel";
import { AvatarPanel } from "../settings/avatar-panel";
import { SettingsPanel } from "../settings/settings-panel";
import { SuggestionBox, useSuggestionBox } from "../settings/suggestion-box";
import type { SettingsProfile } from "../settings/use-settings-profile";
import { Sheet } from "./sheet";

type Theme = "system" | "light" | "dark";
export function usePreferences(userId: string) {
  const [theme, setTheme] = useState<Theme>("system");
  const [haptic, setHaptic] = useState(true);
  const [weightStep, setWeightStep] = useState(0.5);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const key = `gotore:preferences:v2:${userId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      if (["system", "light", "dark"].includes(saved.theme)) setTheme(saved.theme);
      if (typeof saved.haptic === "boolean") setHaptic(saved.haptic);
      if (
        typeof saved.weightStep === "number" &&
        saved.weightStep >= 0.5 &&
        saved.weightStep <= 5 &&
        saved.weightStep * 2 === Math.round(saved.weightStep * 2)
      )
        setWeightStep(saved.weightStep);
    } catch {
      setError("端末の設定を読み込めませんでした。");
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(key, JSON.stringify({ theme, haptic, weightStep }));
    } catch {
      setError("設定を端末に保存できませんでした。");
    }
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme, haptic, weightStep, ready, key]);
  return { theme, setTheme, haptic, setHaptic, weightStep, setWeightStep, error };
}

export function Preferences({
  notifications,
  resources,
  preferences,
  onChanged,
  onExercises,
  onGuide,
  onLogout,
  signingOut,
}: {
  notifications: ReturnType<typeof useNotifications>;
  resources: SettingsProfile;
  preferences: ReturnType<typeof usePreferences>;
  onChanged: () => void;
  onExercises: () => void;
  onGuide: () => void;
  onLogout: () => void;
  signingOut: boolean;
}) {
  const [sheet, setSheet] = useState<"avatar" | "suggestion" | "notifications" | "logout" | null>(
    null,
  );
  const [editingName, setEditingName] = useState(false);
  const [editingWeightStep, setEditingWeightStep] = useState(false);
  const [weightStepDraft, setWeightStepDraft] = useState(preferences.weightStep);
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
        <div className={`group-setting-row settings-name-row${editingName ? " is-editing" : ""}`}>
          <span>表示名</span>
          {editingName ? (
            <SettingsPanel
              profile={profile}
              onCancel={() => setEditingName(false)}
              onSaved={(displayName) => {
                profile.updateData((current) => ({ ...current, display_name: displayName }));
                onChanged();
                setEditingName(false);
              }}
            />
          ) : (
            <button
              className="text-button settings-name-edit-trigger"
              type="button"
              aria-label="表示名を編集"
              onClick={() => setEditingName(true)}
            >
              {profile.data?.display_name}
            </button>
          )}
        </div>
      </div>
      <h2>記録</h2>
      <div className="v2-rows">
        <button
          className="v2-row"
          type="button"
          aria-label="種目を管理"
          data-tour="exercises"
          onClick={onExercises}
        >
          <span>種目</span>
          <span aria-hidden="true">›</span>
        </button>
        <div className={`record-step-setting${editingWeightStep ? " is-editing" : ""}`}>
          <span className="settings-item-label">重量の刻み</span>
          {editingWeightStep ? (
            <div className="record-step-editor">
              <div className="record-step-wheel">
                <NumberWheel
                  label="重量の刻み"
                  unit="kg"
                  value={String(weightStepDraft)}
                  step={0.5}
                  arrowStep={0.5}
                  min={0.5}
                  max={5}
                  showLabel={false}
                  onChange={(value) => {
                    const next = Number(value);
                    if (next >= 0.5 && next <= 5 && next * 2 === Math.round(next * 2))
                      setWeightStepDraft(next);
                  }}
                />
                <span aria-hidden="true">kg</span>
              </div>
              <p className="muted">重量ホイールを一目盛り動かしたときの増減量です。</p>
              <div className="group-name-inline-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setWeightStepDraft(preferences.weightStep);
                    setEditingWeightStep(false);
                  }}
                >
                  キャンセル
                </button>
                <button
                  className="group-name-commit"
                  type="button"
                  onClick={() => {
                    preferences.setWeightStep(weightStepDraft);
                    setEditingWeightStep(false);
                  }}
                >
                  決定
                </button>
              </div>
            </div>
          ) : (
            <button
              className="text-button record-step-edit-trigger"
              type="button"
              aria-label="重量の刻みを編集"
              onClick={() => {
                setWeightStepDraft(preferences.weightStep);
                setEditingWeightStep(true);
              }}
            >
              {preferences.weightStep} kg
            </button>
          )}
        </div>
      </div>
      <h2>アプリ</h2>
      <div className="v2-rows">
        <div className="appearance-setting">
          <span className="settings-item-label">外観</span>
          <div className="appearance-options" aria-label="外観">
            {(["light", "dark", "system"] as const).map((theme) => (
              <button
                type="button"
                key={theme}
                aria-pressed={preferences.theme === theme}
                onClick={() => preferences.setTheme(theme)}
              >
                {{ light: "ライト", dark: "ダーク", system: "自動" }[theme]}
              </button>
            ))}
          </div>
        </div>
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
      <div className="v2-rows">
        <button className="v2-row" type="button" onClick={() => setSheet("notifications")}>
          <span>通知</span>
          <span aria-hidden="true">›</span>
        </button>
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
            sheet === "notifications"
              ? "通知"
              : sheet === "suggestion"
                ? "目安箱"
                : sheet === "avatar"
                  ? "プロフィール画像"
                  : "プロフィール画像"
          }
          onClose={() => setSheet(null)}
        >
          {sheet === "notifications" ? (
            <NotificationSettingsPanel notifications={notifications} />
          ) : sheet === "suggestion" ? (
            <SuggestionBox state={suggestion} />
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
