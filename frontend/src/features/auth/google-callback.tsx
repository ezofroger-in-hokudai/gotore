"use client";

import { getSupabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { LoadingState } from "../loading/loading-state";
import { googleCallbackError } from "./google-auth";

export function GoogleCallback() {
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const callbackError = googleCallbackError(window.location.href);
    if (callbackError) {
      window.history.replaceState(null, "", "/auth/callback");
      setError(callbackError);
      return;
    }
    const client = getSupabase();
    const fail = () => {
      if (!active) return;
      active = false;
      window.history.replaceState(null, "", "/auth/callback");
      setError("Googleでのログインを確認できません。ログイン画面から再試行してください。");
    };
    const timer = window.setTimeout(fail, 15_000);
    if (!client) fail();
    else {
      // SDKによるURLの検証とセッション保存を待ってから、認証情報をURLから除く。
      client.auth
        .getSession()
        .then(({ data, error }) => {
          if (!active) return;
          window.clearTimeout(timer);
          if (error || !data.session) {
            fail();
            return;
          }
          active = false;
          window.history.replaceState(null, "", "/auth/callback");
          window.location.replace("/");
        })
        .catch(fail);
    }
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="auth-page">
      <section className="panel auth-form">
        <h1>Googleでログイン</h1>
        {error ? (
          <>
            <p role="alert" className="error">
              {error}
            </p>
            <a className="secondary full" href="/">
              ログイン画面へ戻る
            </a>
          </>
        ) : (
          <LoadingState label="ログインを確認中" />
        )}
      </section>
    </main>
  );
}
