"use client";
import type { Group, Workout } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { useExerciseCatalog } from "../exercises/use-exercise-catalog";
import { LoadingState } from "../loading/loading-state";
import { OnboardingGuide } from "../onboarding/onboarding-guide";
import { SessionScreen } from "../session/session-screen";
import { TrainingOverview } from "../session/training-overview";
import { useSession } from "../session/use-session";
import { WorkoutResult } from "../session/workout-result";
import { StampProvider } from "../stamps/stamp-provider";
import { ResourceError } from "../training/resource-error";
import { useResource } from "../training/use-resource";
import { WorkoutForm } from "../training/workout-form";
import { AvatarProvider } from "./avatar";
import { CommunityHome, CommunityScreen } from "./community";
import { GroupOrderSheet } from "./group-order-sheet";
import { History } from "./history";
import { GROUP_REFRESH_MS } from "./refresh-interval";
import { Preferences, usePreferences } from "./settings";
import { Sheet } from "./sheet";
import { useGroupOrder } from "./use-group-order";

type View = "home" | "record" | "history" | "settings" | "groups" | "edit" | "result";
export function Workspace({ session }: { session: Session }) {
  return (
    <AvatarProvider key={session.user.id}>
      <StampProvider userId={session.user.id}>
        <WorkspaceContent session={session} />
      </StampProvider>
    </AvatarProvider>
  );
}

function WorkspaceContent({ session }: { session: Session }) {
  const [view, setView] = useState<View>("home");
  const [groupId, setGroupId] = useState("");
  const [groupDetail, setGroupDetail] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [groupRefreshKey, setGroupRefreshKey] = useState(0);
  const [editing, setEditing] = useState<Workout | null>(null);
  const [copy, setCopy] = useState<Workout | null>(null);
  const [guideReplay, setGuideReplay] = useState(0);
  const [guideTarget, setGuideTarget] = useState<{ target: string } | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState("");
  const changed = () => setRefreshKey((key) => key + 1);
  const [finished, setFinished] = useState<Workout | null>(null);
  const training = useSession(session.user.id, changed);
  const preferences = usePreferences(session.user.id);
  const catalog = useExerciseCatalog(changed);
  const groupList = useResource<Group[]>("/groups", groupRefreshKey, GROUP_REFRESH_MS, true, {
    enabled: view === "home" || view === "groups",
    retainOnRefresh: true,
  });
  const groupOrder = useGroupOrder(session.user.id, groupList.data);
  const groups = groupOrder.groups;
  const [orderingGroups, setOrderingGroups] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const prepareHistory =
    view === "home" &&
    pageVisible &&
    groupList.data !== null &&
    !training.busy &&
    !training.pending;
  useEffect(() => {
    if (!prepareHistory) {
      setHistoryReady(false);
      return;
    }
    const timer = window.setTimeout(() => setHistoryReady(true), 1000);
    return () => window.clearTimeout(timer);
  }, [prepareHistory]);
  const recentRecords = useResource<Workout[]>("/workouts?offset=0", refreshKey, false, true, {
    enabled: view === "history" || (view === "home" && !training.session && !training.startingId),
    retainOnRefresh: true,
  });
  const [homeReady, setHomeReady] = useState(false);
  const [opened, setOpened] = useState(false);
  const ready =
    homeReady &&
    (training.ready || !!training.error) &&
    (catalog.data !== null || !!catalog.error) &&
    (!!training.session ||
      !!training.startingId ||
      recentRecords.data !== null ||
      !!recentRecords.error);
  useEffect(() => {
    if (ready) setOpened(true);
  }, [ready]);
  useEffect(() => {
    // 通信や端末復元が止まっても、再試行できる画面へ戻せるよう上限を設ける。
    const timer = window.setTimeout(() => setOpened(true), 15_000);
    return () => window.clearTimeout(timer);
  }, []);
  const previousView = useRef(view);
  // biome-ignore lint/correctness/useExhaustiveDependencies: ホームと履歴は同じ取得を有効にするため、履歴への再訪時だけ明示的に再確認する。
  useEffect(() => {
    const from = previousView.current;
    previousView.current = view;
    if (from === "home" && view === "history" && !training.session && !training.startingId) {
      recentRecords.retry();
    }
  }, [view]);
  const selected = groups.some((group) => group.id === groupId) ? groupId : groups[0]?.id || "";
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, gotoreView: "home" }, "");
    const back = (event: PopStateEvent) => {
      const next = event.state?.gotoreView;
      if (["home", "record", "history", "settings", "groups", "result"].includes(next)) {
        setView(next);
        if (typeof event.state.groupId === "string") setGroupId(event.state.groupId);
      } else setView("home");
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    if (view !== "home" || window.history.state?.gotoreSheet) return;
    // カード切替は履歴を増やさず、シートから戻る先の選択も更新する。
    window.history.replaceState({ ...window.history.state, groupId: selected }, "");
  }, [view, selected]);
  function navigate(next: View, communityMode?: "detail" | "list") {
    if (next !== view)
      window.history.pushState({ gotoreView: next, groupId: selected, communityMode }, "");
    setView(next);
    setNotice("");
    setEditing(null);
    window.scrollTo({ top: 0 });
  }
  const resumable = !!training.session || !!training.startingId;
  const canStart = training.ready && (!training.busy || resumable);
  const primaryView = ["home", "groups", "history", "settings"].includes(view);
  function startOrResume() {
    if (!canStart) return;
    navigate("record");
    if (!resumable) void training.start().catch(() => {});
  }
  async function logout() {
    setSigningOut(true);
    try {
      const result = await getSupabase()?.auth.signOut({ scope: "local" });
      if (result?.error) throw result.error;
    } catch {
      setNotice("ログアウトできません。再試行してください。");
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <div
      className={`app-shell v2-app${!opened ? " is-preparing" : ""}${view === "record" ? " recording-view" : ""}${primaryView ? " has-training-shortcut" : ""}`}
    >
      {!opened && (
        <main className="auth-page startup-screen">
          <LoadingState label="アプリを読み込み中" startup />
        </main>
      )}
      <header className="app-header">
        <button className="wordmark" type="button" onClick={() => navigate("home")}>
          E-GO<span>TORE</span>
        </button>
      </header>
      <main className="main-content">
        {opened && (
          <OnboardingGuide
            userId={session.user.id}
            replay={guideReplay}
            onVisit={(next, target) => {
              setGuideTarget({ target });
              setGroupDetail(false);
              setView(next);
              window.history.replaceState(
                { gotoreView: next, groupId: selected, communityMode: "list" },
                "",
              );
              window.scrollTo({ top: 0 });
            }}
          />
        )}
        {notice && <output className="notice">{notice}</output>}
        {training.error && (
          <div className="error" role="alert">
            {training.error}
            <button
              className="text-button"
              type="button"
              disabled={training.busy}
              onClick={() => void training.reload()}
            >
              保存済みを読み直す
            </button>
          </div>
        )}
        <ResourceError resource={groupList} />
        <div hidden={view !== "home"}>
          <CommunityHome
            groups={groups}
            onReady={setHomeReady}
            loading={groupList.data === null}
            failed={!!groupList.error}
            selected={selected}
            onSelect={setGroupId}
            onOrder={(ids) => {
              groupOrder.save(ids);
              setGroupId(selected);
            }}
            onGroups={() => {
              setGroupDetail(false);
              navigate("groups", "list");
            }}
            onDetail={() => {
              setGroupDetail(true);
              navigate("groups", "detail");
            }}
            refreshKey={refreshKey}
            active={view === "home"}
            trainingAction={
              <section className="home-training" aria-label="トレーニングの状況">
                <p className="muted">
                  {training.session
                    ? `進行中 · ${training.session.exercises.reduce((count, exercise) => count + exercise.sets.length, 0)}セット${training.pending ? " · 同期中" : ""}`
                    : "記録は開始時の所属グループに共有。メモは自分だけ。"}
                </p>
                {!resumable && (
                  <details className="home-review">
                    <summary>前回を振り返る</summary>
                    <TrainingOverview
                      resource={recentRecords}
                      onHistory={() => navigate("history")}
                    />
                  </details>
                )}
              </section>
            }
          />
        </div>
        <div hidden={view !== "record"}>
          <SessionScreen
            catalog={catalog}
            active={view === "record"}
            controller={training}
            userId={session.user.id}
            haptic={preferences.haptic}
            onFinished={(record) => {
              setFinished(record);
              window.history.replaceState({ gotoreView: "result", groupId: selected }, "");
              setView("result");
              setNotice("");
              window.scrollTo({ top: 0 });
            }}
          />
        </div>
        {view === "result" && finished && (
          <WorkoutResult
            record={finished}
            onHistory={() => navigate("history")}
            onHome={() => navigate("home")}
          />
        )}
        <div hidden={view !== "history"}>
          <History
            guideTarget={guideTarget}
            recent={recentRecords}
            active={view === "history"}
            prefetch={prepareHistory && historyReady}
            userId={session.user.id}
            refreshKey={refreshKey}
            onEdit={(record) => {
              if (record.started_at && !record.ended_at) navigate("record");
              else {
                window.history.pushState({ gotoreView: "history", groupId: selected }, "");
                setEditing(record);
                setView("edit");
              }
            }}
            onReuse={(record) => {
              setCopy(record);
            }}
            onDeleted={() => {
              changed();
              void training.reload();
            }}
          />
        </div>
        {view === "edit" && editing && (
          <WorkoutForm
            exerciseCatalog={catalog}
            editing={editing}
            groups={groups}
            selectedGroup={selected}
            userId={session.user.id}
            onSaved={() => {
              changed();
              navigate("history");
              setNotice("更新しました。");
            }}
            onBack={() => navigate("history")}
          />
        )}
        <div hidden={view !== "groups"}>
          <CommunityScreen
            guideTarget={guideTarget}
            groups={groups}
            selected={selected}
            initialDetail={groupDetail}
            active={view === "groups"}
            userId={session.user.id}
            refreshKey={refreshKey}
            onSelect={setGroupId}
            onReorder={() => setOrderingGroups(true)}
            onChanged={() => {
              setGroupRefreshKey((key) => key + 1);
              changed();
            }}
            onHome={() => navigate("home")}
          />
        </div>
        {view === "settings" && (
          <Preferences
            catalog={catalog}
            preferences={preferences}
            onChanged={changed}
            onGuide={() => setGuideReplay((value) => value + 1)}
            onLogout={() => void logout()}
            signingOut={signingOut}
          />
        )}
        {copy && (
          <Sheet
            title="記録をコピー"
            onClose={() => {
              if (!training.busy) setCopy(null);
            }}
          >
            <p>{copy.exercises.map((e) => e.name).join(" / ")}</p>
            <p>
              {training.session?.exercises.length
                ? "進行中のトレーニングに記録があります。終了してからコピーしてください。"
                : "今日のトレーニングとしてセットを保存します。開始時の全所属グループに共有されます。"}
            </p>
            {training.error && (
              <p className="error" role="alert">
                {training.error}
              </p>
            )}
            <button
              className="primary full"
              type="button"
              disabled={training.busy || !training.ready || !!training.session?.exercises.length}
              onClick={async () => {
                try {
                  if (!training.session) {
                    await training.start();
                    setNotice(
                      "トレーニングを開始しました。コピーするセットを確認して保存してください。",
                    );
                  } else {
                    await training.save(copy.exercises);
                    setCopy(null);
                    navigate("record");
                  }
                } catch {}
              }}
            >
              {training.session ? "コピーしたセットを保存" : "トレーニングを開始"}
            </button>
          </Sheet>
        )}
      </main>
      {primaryView && (
        <button
          type="button"
          className="floating-training"
          data-testid="floating-training"
          data-tour="start"
          aria-label={resumable ? "トレーニングを再開" : "トレーニングを開始"}
          disabled={!canStart}
          onClick={startOrResume}
        >
          {resumable ? "RESUME" : "START"}
        </button>
      )}
      {orderingGroups && (
        <GroupOrderSheet
          available={groupList.data !== null}
          groups={groups}
          onClose={() => setOrderingGroups(false)}
          onSave={(ids) => {
            groupOrder.save(ids);
            setGroupId(selected);
          }}
        />
      )}
      <nav className="bottom-nav" aria-label="メインナビゲーション">
        {(
          [
            ["home", "ホーム"],
            ["groups", "グループ"],
            ["history", "履歴"],
            ["settings", "設定"],
          ] as const
        ).map(([next, label]) => (
          <button
            key={next}
            type="button"
            aria-current={
              view === next || (next === "history" && view === "edit") ? "page" : undefined
            }
            onClick={() => {
              if (next === "groups") {
                setGroupDetail(!!selected);
                navigate(next, selected ? "detail" : "list");
              } else navigate(next);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
