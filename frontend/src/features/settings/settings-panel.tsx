import { api } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { type FormEvent, useRef, useState } from "react";
import { LoadingState } from "../loading/loading-state";
import { saveDisplayName } from "./profile";
import { useInlineInputFocus } from "./use-inline-input-focus";
import type { SettingsProfile } from "./use-settings-profile";

export function SettingsPanel({
  profile,
  onSaved,
  onCancel,
}: {
  profile: SettingsProfile["profile"];
  onSaved: (name: string) => void;
  onCancel: () => void;
}) {
  if (profile.data) {
    return (
      <DisplayNameForm
        displayName={profile.data.display_name}
        onSaved={onSaved}
        onCancel={onCancel}
      />
    );
  }
  return (
    <section className="group-name-inline-form">
      {profile.error ? (
        <div className="error" role="alert">
          {profile.error}
          <button className="secondary full" type="button" onClick={profile.retry}>
            再試行
          </button>
        </div>
      ) : (
        <LoadingState label="プロフィールを読み込み中" />
      )}
    </section>
  );
}

function DisplayNameForm({
  displayName,
  onSaved,
  onCancel,
}: { displayName: string; onSaved: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [needsSync, setNeedsSync] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useInlineInputFocus(inputRef);

  async function syncProfile() {
    await api("/me/profile", { method: "POST" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await saveDisplayName(name, {
        updateAuth: async (value) => {
          const client = getSupabase();
          if (!client) throw new Error("認証が必要です");
          const { error } = await client.auth.updateUser({ data: { display_name: value } });
          if (error) throw error;
        },
        syncProfile,
      });
      setName(result.name);
      setNeedsSync(!result.synced);
      if (result.synced) {
        setMessage("保存しました。");
        onSaved(result.name);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "変更できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <form className="group-name-inline-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            <span className="sr-only">表示名</span>
            <input
              ref={inputRef}
              required
              maxLength={20}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
                setMessage("");
              }}
            />
          </label>

          <div className="group-name-inline-actions">
            <button className="text-button" type="button" onClick={onCancel}>
              キャンセル
            </button>
            <button className="group-name-commit" type="submit">
              {busy ? "変更中…" : "決定"}
            </button>
          </div>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && <output className="notice">{message}</output>}
        {needsSync && (
          <div className="error" role="alert">
            表示名は更新済み。共有への反映は未確認です。
            <button
              className="secondary full"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await syncProfile();
                  setNeedsSync(false);
                  setMessage("反映しました。");
                  onSaved(name);
                } catch {
                  setError("反映を確認できません。再試行してください。");
                } finally {
                  setBusy(false);
                }
              }}
            >
              再試行
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
