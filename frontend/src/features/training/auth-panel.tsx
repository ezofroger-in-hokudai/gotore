"use client";

import { getSupabase } from "@/lib/supabase";
import { type FormEvent, useState } from "react";

export function AuthPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const configured = !!getSupabase();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabase();
    if (!client) return;
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email")).trim();
    const password = String(values.get("password"));
    setError("");
    setBusy(true);
    try {
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error) {
        setError(
          "ログインできませんでした。メールアドレスとパスワードを確認し、解決しない場合は管理者にお問い合わせください。",
        );
      }
    } catch {
      setError("接続できませんでした。時間をおいて再試行してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="wordmark">
        GO<span>TORE</span>
      </div>
      <div className="auth-intro">
        <h1>仲間と、合トレ。</h1>
      </div>
      <section className="panel auth-form">
        <h2>ログイン</h2>
        <p className="notice">アカウントの発行は管理者へ。</p>
        <form onSubmit={submit}>
          <fieldset disabled={busy || !configured}>
            <label>
              メールアドレス
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </label>
            <label>
              パスワード
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={6}
                required
                placeholder="6文字以上"
              />
            </label>

            <button className="primary" type="submit">
              {busy ? "確認中…" : "ログイン"}
            </button>
          </fieldset>
        </form>
        {!configured && (
          <p role="alert" className="error">
            ログインの準備ができていません。管理者にお問い合わせください。
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
