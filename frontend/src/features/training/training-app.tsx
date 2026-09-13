"use client";

import { LoadingState } from "../loading/loading-state";

import { getSupabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Workspace } from "../v2/workspace";
import { AuthPanel } from "./auth-panel";

export function TrainingApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setReady(true);
      return;
    }
    let active = true;
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
        }
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  if (!ready)
    return (
      <main className="auth-page">
        <LoadingState label="アプリを読み込み中" startup />
      </main>
    );
  return session ? <Workspace key={session.user.id} session={session} /> : <AuthPanel />;
}
