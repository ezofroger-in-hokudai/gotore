import { api } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { type FormEvent, useState } from "react";
import { useResource } from "../training/use-resource";
import { saveDisplayName } from "./profile";

export function SettingsPanel({ onSaved }: { onSaved: () => void }) {
  const profile = useResource<{ id: string; display_name: string }>("/me");
  if (profile.data) {
    return <DisplayNameForm displayName={profile.data.display_name} onSaved={onSaved} />;
  }
  return (
    <section>
      <h1>設定</h1>
      {profile.error ? (
        <div className="error" role="alert">
          {profile.error}
          <button className="secondary full" type="button" onClick={profile.retry}>
            再試行
          </button>
        </div>
      ) : (
        <output className="loading">読み込み中…</output>
      )}
    </section>
  );
}

function DisplayNameForm({ displayName, onSaved }: { displayName: string; onSaved: () => void }) {
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [needsSync, setNeedsSync] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
        onSaved();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "変更できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>設定</h1>
      <form className="panel" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            表示名
            <input
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

          <button className="primary" type="submit">
            {busy ? "変更中…" : "保存"}
          </button>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && <output className="notice">{message}</output>}
        {needsSync && (
          <div className="error" role="alert">
            表示名は更新済みですが、共有記録への反映を確認できませんでした。
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
                  setMessage("共有記録への反映を確認しました。");
                  onSaved();
                } catch {
                  setError("反映を確認できませんでした。時間をおいて再試行してください。");
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
