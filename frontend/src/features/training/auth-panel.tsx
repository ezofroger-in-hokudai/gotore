"use client";

import { getSupabase } from "@/lib/supabase";
import { type FormEvent, useState } from "react";

export function AuthPanel() {
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const configured = !!getSupabase();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabase();
    if (!client) return;
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email")).trim();
    const password = String(values.get("password"));
    const displayName = String(values.get("name") ?? "").trim();
    setError("");
    setMessage("");
    if (signup && !displayName) {
      setError("表示名を入力してください。");
      return;
    }
    setBusy(true);
    try {
      const result = signup
        ? await client.auth.signUp({
            email,
            password,
            options: { data: { display_name: displayName } },
          })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) {
        setError(
          signup
            ? "登録できませんでした。入力内容を確認し、再試行してください。"
            : "ログインできませんでした。メールアドレスとパスワード、メール認証を確認してください。",
        );
      } else if (signup && !result.data.session) {
        setMessage("確認メールを送信しました。メールのリンクを開いてからログインしてください。");
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
        <small>TRAIN TOGETHER, ANYWHERE.</small>
      </div>
      <div className="auth-intro">
        <p className="eyebrow">離れていても、合トレ。</p>
        <h1>
          今日の頑張りを、
          <br />
          仲間と残そう。
        </h1>
        <p>
          記録して、共有する。
          <br />
          仲間の一回が、自分の次の一回になる。
        </p>
      </div>
      <section className="panel auth-form">
        <div className="segmented" aria-label="アカウント操作">
          <button
            type="button"
            className={!signup ? "selected" : ""}
            onClick={() => {
              setSignup(false);
              setError("");
              setMessage("");
            }}
          >
            ログイン
          </button>
          <button
            type="button"
            className={signup ? "selected" : ""}
            onClick={() => {
              setSignup(true);
              setError("");
              setMessage("");
            }}
          >
            新規登録
          </button>
        </div>
        <form onSubmit={submit}>
          <fieldset disabled={busy || !configured}>
            {signup && (
              <label>
                表示名
                <input
                  name="name"
                  autoComplete="nickname"
                  maxLength={20}
                  required
                  placeholder="仲間に表示する名前"
                />
              </label>
            )}
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
                autoComplete={signup ? "new-password" : "current-password"}
                minLength={6}
                required
                placeholder="6文字以上"
              />
            </label>
            <p className="notice">
              グループへ共有した記録と表示名は、そのグループのメンバーに見えます。
            </p>
            <button className="primary" type="submit">
              {busy ? "確認しています…" : signup ? "アカウントを作成" : "ログインする →"}
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
        {message && <output className="notice">{message}</output>}
      </section>
      <p className="auth-footer">見る。見られる。続けられる。</p>
    </main>
  );
}
