"use client";

import { getSupabase } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";

export function ConfirmEmail() {
  const confirmation = useRef<Promise<boolean> | null>(null);
  const [state, setState] = useState<"checking" | "success" | "error">("checking");
  useEffect(() => {
    let active = true;
    // Strict Modeの再実行でも、SDKが消費する確認URLは一度だけ扱う。
    confirmation.current ??= (async () => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.hash.slice(1));
      const valid =
        params.has("access_token") &&
        params.has("refresh_token") &&
        params.get("type") === "signup" &&
        !params.has("error") &&
        !params.has("error_code") &&
        !url.searchParams.has("error") &&
        !url.searchParams.has("error_code");
      try {
        if (!valid) return false;
        const client = getSupabase();
        if (!client) return false;
        const { data, error } = await client.auth.getSession();
        // SDKがURLのトークンをAuthサーバーで検証したセッションだけを成功とする。
        return (
          !error &&
          !!data.session?.user.email_confirmed_at &&
          data.session.access_token === params.get("access_token")
        );
      } catch {
        return false;
      } finally {
        window.history.replaceState(window.history.state, "", "/auth/confirm");
      }
    })();
    confirmation.current.then((success) => {
      if (active) setState(success ? "success" : "error");
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="auth-page">
      <div className="wordmark">
        GO<span>TORE</span>
      </div>
      <section className="panel auth-form auth-confirm">
        <h1>
          {state === "checking"
            ? "メールを確認中…"
            : state === "success"
              ? "メールを確認しました"
              : "メールを確認できませんでした"}
        </h1>
        {state === "checking" ? (
          <output>このままお待ちください。</output>
        ) : state === "success" ? (
          <>
            <p>登録が完了しました。</p>
            <a className="primary" href="/">
              GO TOREをはじめる
            </a>
          </>
        ) : (
          <>
            <p role="alert">
              リンクの期限切れ・使用済み、または接続の問題が考えられます。確認済みの場合はログインできます。
            </p>
            <div className="auth-actions">
              <a className="primary" href="/auth/resend">
                確認メールを再送する
              </a>
              <a className="text-button" href="/">
                ログインへ戻る
              </a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
