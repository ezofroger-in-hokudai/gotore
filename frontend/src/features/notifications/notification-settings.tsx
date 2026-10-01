import { isDemoMode } from "../demo/mode";
import type { useNotifications } from "./use-notifications";
export function NotificationSettingsPanel({
  notifications: n,
}: { notifications: ReturnType<typeof useNotifications> }) {
  const s = n.settings;
  return (
    <div className="notification-settings-panel">
      {!n.ready ? (
        <button type="button" onClick={() => void n.reloadSettings()}>
          通知設定を読み直す
        </button>
      ) : (
        <>
          <h3>アプリ内</h3>
          {(
            [
              ["stamp_enabled", "スタンプ通知"],
              ["start_enabled", "トレーニング開始通知"],
              ["vibration", "通知の振動"],
              ["sound", "通知の音"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="notification-setting-row">
              <input
                type="checkbox"
                checked={s[key]}
                disabled={n.saving}
                onChange={(e) => void n.saveSettings({ ...s, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
          <label className="notification-setting-select">
            開始通知を出すタイミング
            <select
              value={s.start_timing}
              disabled={n.saving}
              onChange={(e) =>
                void n.saveSettings({ ...s, start_timing: e.target.value as typeof s.start_timing })
              }
            >
              <option value="home">ホームに戻ったとき</option>
              <option value="now">どの画面でもすぐに</option>
              <option value="set">記録中はセット保存後</option>
            </select>
          </label>
          <p className="muted">
            振動は対応する端末で利用できます。iPhoneのアプリ内通知では振動しません。
          </p>
          {!isDemoMode() && (
            <>
              <h3>アプリを閉じているとき</h3>
              {(
                [
                  ["push_stamp", "スタンプの端末通知"],
                  ["push_start", "開始の端末通知"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="notification-setting-row">
                  <input
                    type="checkbox"
                    checked={s[key]}
                    disabled={n.saving}
                    onChange={(e) => void n.saveSettings({ ...s, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
              <p className="muted">
                iPhoneはホーム画面に追加してから有効にしてください。端末通知の音・振動は端末の設定に従います。
              </p>
              <button
                type="button"
                className="primary"
                disabled={n.saving}
                onClick={() => void n.requestPush()}
              >
                {n.pushId ? "この端末の通知を確認" : "この端末の通知を有効にする"}
              </button>
              {n.pushId && (
                <button type="button" disabled={n.saving} onClick={() => void n.revokePush()}>
                  この端末の通知を解除
                </button>
              )}
            </>
          )}
        </>
      )}
      {n.error && (
        <p className="error" role="alert">
          {n.error}
        </p>
      )}
    </div>
  );
}
