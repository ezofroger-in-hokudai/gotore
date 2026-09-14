"use client";

import { api } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useState } from "react";
import { LoadingState } from "../loading/loading-state";
import { saveDisplayName } from "../settings/profile";
import { Workspace } from "../v2/workspace";
import { needsGoogleDisplayName } from "./google-auth";

export function AccountWorkspace({ session }: { session: Session }) {
  // Auth更新通知だけでは進めず、共有プロフィールへの同期完了まで設定画面を保つ。
  const [setup, setSetup] = useState(() => needsGoogleDisplayName(session.user));
  return setup ? (
    <InitialDisplayName onSaved={() => setSetup(false)} />
  ) : (
    <Workspace session={session} />
  );
}

function InitialDisplayName({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [needsSync, setNeedsSync] = useState(false);
  const [error, setError] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: 再試行ボタンでも初回プロフィールを再取得する。
  useEffect(() => {
    let active = true;
    setError("");
    api<{ display_name: string }>("/me")
      .then((profile) => {
        if (!active) return;
        setName(profile.display_name === "トレーニー" ? "" : profile.display_name);
        setReady(true);
      })
      .catch(() => {
        if (active) setError("表示名を確認できません。再試行してください。");
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      if (needsSync) {
        await api("/me/profile", { method: "POST" });
        onSaved();
        return;
      }
      const result = await saveDisplayName(name, {
        updateAuth: async (displayName) => {
          const client = getSupabase();
          if (!client) throw new Error("認証が必要です");
          const { error } = await client.auth.updateUser({ data: { display_name: displayName } });
          if (error) throw error;
        },
        syncProfile: async () => {
          await api("/me/profile", { method: "POST" });
        },
      });
      setName(result.name);
      if (result.synced) onSaved();
      else {
        setNeedsSync(true);
        setError("表示名は保存済みです。反映を再試行してください。");
      }
    } catch (reason) {
      setError(
        needsSync
          ? "反映できません。再試行してください。"
          : reason instanceof Error
            ? reason.message
            : "保存できません。再試行してください。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="panel auth-form">
        <h1>表示名を決める</h1>
        <p className="auth-description">仲間に表示するニックネームです。あとから変更できます。</p>
        {ready ? (
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              <label>
                表示名
                <input
                  name="display_name"
                  required
                  maxLength={20}
                  value={name}
                  disabled={needsSync}
                  autoComplete="nickname"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button className="primary" type="submit">
                {busy ? "保存中…" : needsSync ? "反映を再試行" : "はじめる"}
              </button>
            </fieldset>
          </form>
        ) : error ? (
          <button className="secondary full" type="button" onClick={() => setAttempt(attempt + 1)}>
            再試行
          </button>
        ) : (
          <LoadingState label="表示名を確認中" />
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="text-button"
          disabled={busy}
          type="button"
          onClick={async () => {
            setBusy(true);
            try {
              const result = await getSupabase()?.auth.signOut();
              if (result?.error) throw result.error;
            } catch {
              setError("ログアウトできません。再試行してください。");
            } finally {
              setBusy(false);
            }
          }}
        >
          ログアウト
        </button>
      </section>
    </main>
  );
}
