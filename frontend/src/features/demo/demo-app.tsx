"use client";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "../v2/sheet";
import { Workspace } from "../v2/workspace";
import { prepareDemo, receiveDemo, resetDemo } from "./runtime";
import "./demo.css";
export function DemoApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    setSession(prepareDemo());
    return () => {
      for (const timer of timers.current) clearTimeout(timer);
    };
  }, []);
  function play(kind: "stamp" | "start", count: number, continuous = false) {
    setOpen(false);
    if (continuous)
      for (let i = 0; i < count; i++)
        timers.current.push(setTimeout(() => receiveDemo(kind, 1), 500 + i * 800));
    else timers.current.push(setTimeout(() => receiveDemo(kind, count), 350));
  }
  if (!session) return <main className="auth-page">デモを準備しています…</main>;
  return (
    <>
      <Workspace session={session} />
      <button className="demo-entry" type="button" onClick={() => setOpen(true)}>
        デモ
      </button>
      {open && (
        <Sheet title="デモを試す" onClose={() => setOpen(false)}>
          <p className="muted">
            架空の「ezofrogs」で操作できます。変更はこのデモ内だけに反映されます。
          </p>
          <div className="demo-actions">
            <button className="v2-row" type="button" onClick={() => play("stamp", 1)}>
              スタンプを1件受け取る <span>›</span>
            </button>
            <button className="v2-row" type="button" onClick={() => play("stamp", 10, true)}>
              スタンプを続けて受け取る <span>›</span>
            </button>
            <button className="v2-row" type="button" onClick={() => play("stamp", 20)}>
              スタンプを20件受け取る <span>›</span>
            </button>
            <button className="v2-row" type="button" onClick={() => play("start", 1)}>
              仲間1人がトレーニング開始 <span>›</span>
            </button>
            <button className="v2-row" type="button" onClick={() => play("start", 8)}>
              仲間8人がトレーニング開始 <span>›</span>
            </button>
          </div>
          <p className="muted">
            開始通知は本物と同じ設定で動きます。初期設定ではホームで表示します。
          </p>
          <button className="secondary full" type="button" onClick={resetDemo}>
            最初からやり直す
          </button>
          <a className="text-button demo-real-link" href="/">
            実際のアプリへ
          </a>
        </Sheet>
      )}
    </>
  );
}
