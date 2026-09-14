"use client";

import { getSupabase } from "@/lib/supabase";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { authErrorMessage, confirmationUrl, isAuthRateLimit, signupValues } from "../auth/signup";

type Mode = "login" | "signup" | "pending" | "resend";

export function AuthPanel({ initialMode = "login" }: { initialMode?: "login" | "resend" }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(0);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const configured = !!getSupabase();

  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= retryAt) setRetryAt(0);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  function cooldown() {
    const time = Date.now();
    setNow(time);
    setRetryAt(time + 60_000);
  }

  function changeMode(next: Mode) {
    setMode(next);
    setPassword("");
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabase();
    if (!client || submitting.current || (mode !== "login" && remaining > 0)) return;
    let values: ReturnType<typeof signupValues> | undefined;
    if (mode === "signup") {
      try {
        values = signupValues(name, email, password);
      } catch (failure) {
        setError((failure as Error).message);
        return;
      }
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const address = email.trim();
    setEmail(address);
    try {
      const options = {
        emailRedirectTo: confirmationUrl(window.location.origin),
      };
      const result =
        mode === "login"
          ? await client.auth.signInWithPassword({ email: address, password })
          : mode === "signup" && values
            ? await client.auth.signUp({
                email: values.email,
                password: values.password,
                options: { ...options, data: { display_name: values.name } },
              })
            : await client.auth.resend({
                type: "signup",
                email: address,
                options,
              });
      if (result.error) {
        if (isAuthRateLimit(result.error)) cooldown();
        if (result.error.code === "email_not_confirmed") {
          setPassword("");
          setMode("pending");
        }
        if (
          ["user_already_exists", "email_exists"].includes(result.error.code ?? "") ||
          ((mode === "pending" || mode === "resend") && result.error.code === "user_not_found")
        ) {
          setPassword("");
          setMode("pending");
          setNotice(
            "メールのリンクを開いて登録を完了してください。登録済みの場合はログインできます。",
          );
          cooldown();
        } else {
          setError(authErrorMessage(result.error));
        }
        return;
      }
      if (mode === "login") {
        if (window.location.pathname !== "/") window.location.assign("/");
      } else {
        setPassword("");
        setMode("pending");
        setNotice(
          "メールのリンクを開いて登録を完了してください。登録済みの場合はログインできます。",
        );
        cooldown();
      }
    } catch {
      setError("接続できません。再試行してください。");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const title =
    mode === "login"
      ? "ログイン"
      : mode === "signup"
        ? "新規登録"
        : mode === "pending"
          ? "確認メールをご確認ください"
          : "確認メールの再送";
  return (
    <main className="auth-page">
      <div className="wordmark">
        GO<span>TORE</span>
      </div>
      <div className="auth-intro">
        <h1>仲間と、合トレ。</h1>
      </div>
      <section className="panel auth-form">
        <h2>{title}</h2>
        {mode === "pending" && (
          <div className="auth-message">
            <p className="auth-email">{email}</p>
            <p>届かない場合は迷惑メールフォルダーとアドレスを確認してください。</p>
          </div>
        )}
        <form onSubmit={submit}>
          <fieldset disabled={busy || !configured}>
            {mode === "signup" && (
              <label>
                表示名
                <input
                  name="display_name"
                  autoComplete="nickname"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  placeholder="1〜20文字"
                />
              </label>
            )}
            {mode !== "pending" && (
              <label>
                メールアドレス
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            )}
            {(mode === "login" || mode === "signup") && (
              <label>
                パスワード
                <input
                  name="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={mode === "signup" ? 8 : undefined}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "signup" ? "8文字以上" : "パスワード"}
                />
              </label>
            )}
            <button className="primary" type="submit" disabled={mode !== "login" && remaining > 0}>
              {busy
                ? "確認中…"
                : mode !== "login" && remaining > 0
                  ? `再送まで${remaining}秒`
                  : mode === "login"
                    ? "ログイン"
                    : mode === "signup"
                      ? "確認メールを送る"
                      : "確認メールを再送する"}
            </button>
          </fieldset>
        </form>
        {notice && <output className="auth-message">{notice}</output>}
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
        <div className="auth-actions">
          {mode === "login" ? (
            <>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => changeMode("signup")}
              >
                新規登録
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => changeMode("resend")}
              >
                確認メールを再送する
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => changeMode("login")}
              >
                ログインへ戻る
              </button>
              {mode === "pending" && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => changeMode("signup")}
                >
                  アドレスを修正して登録する
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
