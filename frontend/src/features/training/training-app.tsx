"use client";

import type { Group, GroupDetail, Workout } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { ActivityCalendar } from "../activity/activity-calendar";
import { dateLabel } from "../activity/calendar";
import { OnboardingGuide } from "../onboarding/onboarding-guide";
import { SettingsPanel } from "../settings/settings-panel";
import { AuthPanel } from "./auth-panel";
import { GroupPanel } from "./group-panel";
import { RecordList } from "./record-list";
import { useResource } from "./use-resource";
import { WorkoutForm } from "./workout-form";

type View = "home" | "records" | "groups" | "workout" | "settings";

function Workspace({ session }: { session: Session }) {
  const [guideReplay, setGuideReplay] = useState(0);
  const [editing, setEditing] = useState<Workout | null>(null);
  const [source, setSource] = useState<Workout | null>(null);
  const [view, setView] = useState<View>("home");
  const [groupId, setGroupId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");
  const [notice, setNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const groupList = useResource<Group[]>(
    "/groups",
    refreshKey,
    view === "home" || view === "groups",
  );
  const groups = groupList.data ?? [];
  const activeId = groups.some((group) => group.id === groupId) ? groupId : groups[0]?.id || "";
  const detail = useResource<GroupDetail>(
    activeId && view === "groups" ? `/groups/${activeId}` : null,
    refreshKey,
    view === "groups",
  );
  const path =
    view === "records"
      ? `/workouts?offset=${page * 50}${selectedDate ? `&performed_on=${selectedDate}` : ""}`
      : view === "home" && activeId
        ? `/groups/${activeId}/workouts?offset=${page * 50}`
        : null;
  const records = useResource<Workout[]>(path, refreshKey, view === "home");

  function navigate(next: View) {
    setEditing(null);
    setSource(null);
    setView(next);
    setPage(0);
    setSelectedDate("");
    setNotice("");
  }
  function select(id: string) {
    setGroupId(id);
    setPage(0);
  }
  function selectDate(value: string) {
    setSelectedDate(value);
    setPage(0);
  }
  function saved(workout: Workout) {
    setSelectedDate("");
    setSource(null);
    setRefreshKey((value) => value + 1);
    setPage(0);
    if (editing) {
      setEditing(null);
      setView("records");
      setNotice("記録を更新しました。");
      return;
    }
    if (workout.group_id) {
      setGroupId(workout.group_id);
      setView("home");
    } else setView("records");
    setNotice(
      workout.group_id ? "記録を保存し、グループへ共有しました。" : "自分の記録を保存しました。",
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="wordmark" href="/">
          GO<span>TORE</span>
        </a>
        <button
          className="text-button"
          type="button"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            try {
              const result = await getSupabase()?.auth.signOut({
                scope: "local",
              });
              if (result?.error) setNotice("ログアウトできませんでした。再試行してください。");
            } catch {
              setNotice("ログアウトできませんでした。接続を確認してください。");
            } finally {
              setSigningOut(false);
            }
          }}
        >
          {signingOut ? "処理中…" : "ログアウト"}
        </button>
      </header>
      <main className="main-content">
        <OnboardingGuide userId={session.user.id} replay={guideReplay} />
        {notice && <output className="notice">{notice}</output>}
        {groupList.error && (
          <div className="error" role="alert">
            {groupList.error}
            <button className="text-button" type="button" onClick={groupList.retry}>
              再試行
            </button>
          </div>
        )}
        {view === "workout" ? (
          <WorkoutForm
            key={editing?.id ?? "new"}
            editing={editing}
            source={source}
            groups={groups}
            selectedGroup={activeId}
            userId={session.user.id}
            onSaved={saved}
            onBack={() => {
              navigate(editing ? "records" : "home");
              setRefreshKey((value) => value + 1);
            }}
          />
        ) : view === "settings" ? (
          <>
            <SettingsPanel onSaved={() => setRefreshKey((value) => value + 1)} />
            <section className="panel">
              <h2>GO TOREの使い方</h2>
              <p className="muted">グループへの参加、記録、共有範囲を確認できます。</p>
              <button
                className="secondary full"
                type="button"
                onClick={() => setGuideReplay((value) => value + 1)}
              >
                使い方ガイドを開く
              </button>
            </section>
          </>
        ) : (
          <>
            {view === "groups" ? (
              <GroupPanel
                onMembershipChanged={(left) => {
                  setRefreshKey((value) => value + 1);
                  if (left) {
                    setGroupId("");
                    setPage(0);
                    setView("home");
                    setNotice("グループを退出しました。本人の記録は残っています。");
                  }
                }}
                userId={session.user.id}
                groups={groups}
                detail={detail.data}
                onSelect={select}
                onGroup={(group) => {
                  setGroupId(group.id);
                  setRefreshKey((value) => value + 1);
                }}
              />
            ) : (
              <>
                <div className="page-title">
                  <div>
                    <p className="eyebrow">
                      {view === "home" ? "TRAIN TOGETHER" : "YOUR WORKOUTS"}
                    </p>
                    <h1>
                      {view === "home" ? "仲間の、今日の頑張り。" : "積み重ねた、自分の記録。"}
                    </h1>
                  </div>
                  <span className="red-dot" />
                </div>
                {view === "home" && groups.length > 0 && (
                  <label className="group-select">
                    表示するグループ
                    <select value={activeId} onChange={(e) => select(e.target.value)}>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {view === "home" && !groups.length && !groupList.loading && !groupList.error && (
                  <div className="welcome panel">
                    <p className="eyebrow">START YOUR TEAM</p>
                    <h2>
                      いつもの仲間と、
                      <br />
                      ここでも合トレ。
                    </h2>
                    <p>グループを作るか、仲間からの招待コードで参加しましょう。</p>
                    <button type="button" className="primary" onClick={() => navigate("groups")}>
                      グループを作る・参加する →
                    </button>
                  </div>
                )}
                {view === "home" && activeId && (
                  <div className="feed-heading">
                    <h2>みんなの記録</h2>
                    <span className="muted">5秒ごとに更新</span>
                  </div>
                )}
                {view === "records" && (
                  <>
                    <ActivityCalendar
                      selectedDate={selectedDate}
                      onSelect={selectDate}
                      refreshKey={refreshKey}
                    />
                    {selectedDate && (
                      <div className="daily-record-heading">
                        <h2>{dateLabel(selectedDate)}のトレーニング</h2>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => selectDate("")}
                        >
                          日付の絞り込みを解除
                        </button>
                      </div>
                    )}
                  </>
                )}
                {records.error && (
                  <div className="error" role="alert">
                    {records.error}
                    <button className="text-button" type="button" onClick={records.retry}>
                      再試行
                    </button>
                  </div>
                )}
                {records.loading && records.data === null && (
                  <output className="loading">記録を読み込んでいます…</output>
                )}
                {records.data && (
                  <RecordList
                    onEdit={
                      view === "records"
                        ? (record) => {
                            setEditing(record);
                            setSource(null);
                            setNotice("");
                            setView("workout");
                          }
                        : undefined
                    }
                    onReuse={
                      view === "records"
                        ? (record) => {
                            setSource(record);
                            setEditing(null);
                            setNotice("");
                            setView("workout");
                          }
                        : undefined
                    }
                    onDeleted={
                      view === "records"
                        ? () => {
                            setRefreshKey((value) => value + 1);
                            setPage(0);
                            setNotice("記録を削除しました。");
                          }
                        : undefined
                    }
                    records={records.data}
                    userId={session.user.id}
                    empty={
                      view === "home"
                        ? "記録を共有すると、ここに仲間の頑張りが並びます。"
                        : selectedDate
                          ? "この日のトレーニング記録はありません。"
                          : "最初のトレーニングを記録してみましょう。"
                    }
                  />
                )}
                {(page > 0 || records.data?.length === 50) && (
                  <div className="pagination">
                    <button
                      type="button"
                      className="secondary"
                      disabled={page === 0 || records.loading}
                      onClick={() => setPage((value) => value - 1)}
                    >
                      新しい記録
                    </button>
                    <span>{page + 1}ページ</span>
                    <button
                      type="button"
                      className="secondary"
                      disabled={records.data?.length !== 50 || records.loading}
                      onClick={() => setPage((value) => value + 1)}
                    >
                      以前の記録
                    </button>
                  </div>
                )}
              </>
            )}
            {detail.error && view === "groups" && (
              <div className="error" role="alert">
                {detail.error}
                <button type="button" className="text-button" onClick={detail.retry}>
                  再試行
                </button>
              </div>
            )}
            <button
              type="button"
              className="primary record-cta"
              onClick={() => navigate("workout")}
            >
              ＋ トレーニングを記録
            </button>
          </>
        )}
      </main>
      {view !== "workout" && (
        <nav className="bottom-nav" aria-label="メインナビゲーション">
          {(
            [
              ["home", "⌂", "ホーム"],
              ["records", "▤", "自分の記録"],
              ["groups", "♧", "グループ"],
              ["settings", "⚙", "設定"],
            ] as const
          ).map(([next, symbol, label]) => (
            <button
              key={next}
              type="button"
              aria-current={view === next ? "page" : undefined}
              onClick={() => navigate(next)}
            >
              <span aria-hidden="true">{symbol}</span>
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

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
        <output>GO TOREを開いています…</output>
      </main>
    );
  return session ? <Workspace key={session.user.id} session={session} /> : <AuthPanel />;
}
