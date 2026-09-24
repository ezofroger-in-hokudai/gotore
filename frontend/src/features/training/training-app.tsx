"use client";

import { LoadingState } from "../loading/loading-state";

import { getSupabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { AccountWorkspace } from "../auth/account-workspace";
import { AuthPanel } from "./auth-panel";

export function TrainingApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(true);
  useEffect(() => {
    const client = getSupabase();
    if (!client) return;
    let active = true;
    // 認証サーバーへの到達待ちで、記録画面全体を無期限に止めない。
    const timeout = window.setTimeout(() => {
      if (active) setReady(true);
    }, 5000);
    const { data } = client.auth.onAuthStateChange((_event, current) => {
      if (active) {
        setSession(current);
        setReady(true);
      }
    });
    client.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data.session);
          setReady(true);
          window.clearTimeout(timeout);
        }
      })
      .catch(() => {
        if (active) setReady(true);
        window.clearTimeout(timeout);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      data.subscription.unsubscribe();
    };
  }, []);
  if (!ready)
    return (
      <main className="auth-page">
        <LoadingState label="アプリを読み込み中" startup />
      </main>
    );
  return session ? <AccountWorkspace key={session.user.id} session={session} /> : <AuthPanel />;
}
