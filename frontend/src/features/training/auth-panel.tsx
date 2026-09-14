"use client";

import { getSupabase } from "@/lib/supabase";
import { type FormEvent, useEffect, useState } from "react";
import { googleSignInOptions } from "../auth/google-auth";

export function AuthPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const configured = !!getSupabase();
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

  useEffect(() => {
    const restore = () => setBusy(false);
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  async function googleLogin() {
    const client = getSupabase();
    if (!client || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.signInWithOAuth(
        googleSignInOptions(window.location.origin),
      );
      if (error) throw error;
    } catch {
      setError("Googleでのログインを開始できません。再試行してください。");
      setBusy(false);
    }
  }

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
        setError("ログインできません。入力を確認し、解決しなければ管理者へ。");
      }
    } catch {
      setError("接続できません。再試行してください。");
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
        {googleEnabled ? (
          <>
            <button
              className="google-signin"
              type="button"
              disabled={busy || !configured}
              onClick={googleLogin}
            >
              <img src="/google-g.svg" alt="" width="20" height="20" />
              <span>Googleで続ける</span>
            </button>
            <p className="auth-description">初めての方も、そのまま登録できます。</p>
            <p className="auth-email-label">メールで登録済みの方</p>
          </>
        ) : (
          <p className="notice">アカウントの発行は管理者へ。</p>
        )}
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
            ログインできません。管理者へ。
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
