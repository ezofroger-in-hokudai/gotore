"use client";
import type { Group, TodayActivity, Workout } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { useExerciseCatalog } from "../exercises/use-exercise-catalog";
import { LoadingState } from "../loading/loading-state";
import { OnboardingGuide } from "../onboarding/onboarding-guide";
import { SessionScreen } from "../session/session-screen";
import { useSession } from "../session/use-session";
import { WorkoutResult } from "../session/workout-result";
import { StampProvider } from "../stamps/stamp-provider";
import { ResourceError } from "../training/resource-error";
import { useResource } from "../training/use-resource";
import { WorkoutForm } from "../training/workout-form";
import { AvatarProvider } from "./avatar";
import { CommunityHome } from "./community";
import { FloatingTraining } from "./floating-training";
import { type CommunityMode, CommunityScreen } from "./group-screen";
import { History } from "./history";
import { runNavigationMotion } from "./navigation-motion";
import { GROUP_REFRESH_MS, todayActivityRefreshMs } from "./refresh-interval";
import { Preferences, usePreferences } from "./settings";
import { SharedWorkoutCache } from "./shared-workout-cache";
import { Sheet } from "./sheet";
import { useEdgeBack } from "./use-edge-back";
import { useGroupOrder } from "./use-group-order";

type View = "home" | "record" | "history" | "settings" | "groups" | "edit" | "result";
function scrollPageToTop() {
  window.scrollTo({ top: 0 });
  document.querySelector<HTMLElement>(".main-content")?.scrollTo({ top: 0 });
}

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
  useEdgeBack();
  const [sharedCache] = useState(() => new SharedWorkoutCache());
  const [view, setView] = useState<View>("home");
  const viewRef = useRef(view);
  const historyPosition = useRef(0);
  const [groupId, setGroupId] = useState("");
  const [groupMode, setGroupMode] = useState<CommunityMode>("list");
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
  const [finishConflictOpen, setFinishConflictOpen] = useState(false);
  const training = useSession(session.user.id, changed);
  const resultConfirmed =
    !!finished && training.saved?.id === finished.id && !!training.saved.ended_at;
  const preferences = usePreferences(session.user.id);
  const catalog = useExerciseCatalog(changed);
  const groupList = useResource<Group[]>("/groups", groupRefreshKey, GROUP_REFRESH_MS, true, {
    enabled: view === "home" || view === "groups",
    retainOnRefresh: true,
  });
  useEffect(() => {
    if (groupList.data) sharedCache.retainGroups(new Set(groupList.data.map((group) => group.id)));
  }, [groupList.data, sharedCache]);
  const groupOrder = useGroupOrder(session.user.id, groupList.data);
  const groups = groupOrder.groups;
  const [recordSelecting, setRecordSelecting] = useState(true);
  const todayActivity = useResource<TodayActivity>(
    "/groups/today-activity",
    refreshKey,
    todayActivityRefreshMs,
    true,
    {
      enabled: groups.length > 0 && (view === "home" || (view === "record" && recordSelecting)),
      retainOnRefresh: true,
    },
  );
  const currentGroupIds = groups
    .map((group) => group.id)
    .toSorted()
    .join(",");
  const activityGroupIds = todayActivity.data?.groups
    .map((group) => group.group_id)
    .toSorted()
    .join(",");
  const visibleTodayActivity = {
    ...todayActivity,
    data: activityGroupIds === currentGroupIds ? todayActivity.data : null,
  };
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
  const [inviteLanding] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("groupInvite"),
  );
  const ready =
    (inviteLanding && view === "groups") ||
    (homeReady &&
      (training.ready || !!training.error) &&
      (catalog.data !== null || !!catalog.error) &&
      (!!training.session ||
        !!training.startingId ||
        recentRecords.data !== null ||
        !!recentRecords.error));
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
    const inviteEntry = new URLSearchParams(window.location.search).has("groupInvite");
    window.history.replaceState(
      {
        ...window.history.state,
        gotoreView: inviteEntry ? "groups" : "home",
        gotoreBack: false,
        gotoreMotionIndex: 0,
        communityMode: inviteEntry ? "join" : undefined,
      },
      "",
    );
    if (inviteEntry) {
      viewRef.current = "groups";
      setView("groups");
    }
    const back = (event: PopStateEvent) => {
      const next = event.state?.gotoreView;
      const target: View = ["home", "record", "history", "settings", "groups", "result"].includes(
        next,
      )
        ? next
        : "home";
      const nextPosition = Number(event.state?.gotoreMotionIndex);
      const direction =
        Number.isFinite(nextPosition) && nextPosition > historyPosition.current
          ? "forward"
          : "back";
      if (Number.isFinite(nextPosition)) historyPosition.current = nextPosition;
      const update = () => {
        viewRef.current = target;
        setView(target);
        if (typeof event.state?.groupId === "string") setGroupId(event.state.groupId);
        if (
          target === "groups" &&
          ["list", "detail", "create", "join", "invite", "members"].includes(
            event.state?.communityMode,
          )
        ) {
          setGroupMode(event.state.communityMode as CommunityMode);
        }
      };
      if (target === viewRef.current) update();
      else {
        viewRef.current = target;
        runNavigationMotion(update, direction);
      }
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    if (view !== "home" || window.history.state?.gotoreSheet) return;
    // カード切替は履歴を増やさず、シートから戻る先の選択も更新する。
    window.history.replaceState({ ...window.history.state, groupId: selected }, "");
  }, [view, selected]);
  function navigate(next: View, communityMode?: CommunityMode) {
    const current = viewRef.current;
    if (next !== current) {
      historyPosition.current = (Number(window.history.state?.gotoreMotionIndex) || 0) + 1;
      window.history.pushState(
        {
          gotoreView: next,
          groupId: selected,
          communityMode,
          gotoreBack: true,
          gotoreMotionIndex: historyPosition.current,
        },
        "",
      );
    }
    // 設定で追加・分類変更した候補を、記録の選択画面へ戻る前に確認する。
    if (next === "record") catalog.retry();
    const update = () => {
      viewRef.current = next;
      setView(next);
      setNotice("");
      setEditing(null);
      scrollPageToTop();
    };
    if (next === current) update();
    else {
      const order: View[] = ["home", "groups", "history", "settings"];
      const direction =
        order.includes(current) && order.includes(next)
          ? order.indexOf(next) > order.indexOf(current)
            ? "forward"
            : "back"
          : order.includes(next)
            ? "back"
            : "forward";
      viewRef.current = next;
      runNavigationMotion(update, direction);
    }
  }
  const resumable = !!training.session || !!training.startingId;
  const canStart = training.ready && !training.finishPending && (!training.busy || resumable);
  const primaryView = ["home", "groups", "history", "settings"].includes(view);
  function startOrResume() {
    if (!canStart) return;
    navigate("record");
    if (!resumable) void training.start().catch(() => {});
  }
  async function logout() {
    setSigningOut(true);
    sharedCache.clear();
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
      className={`app-shell v2-app${!opened ? " is-preparing" : ""}${view === "record" ? " recording-view" : ""}${view === "history" ? " personal-history-view" : ""}${primaryView ? " has-training-shortcut" : ""}`}
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
        {opened && !inviteLanding && (
          <OnboardingGuide
            userId={session.user.id}
            replay={guideReplay}
            onVisit={(next, target) => {
              setGuideTarget({ target });
              setGroupMode("list");
              viewRef.current = next;
              setView(next);
              window.history.replaceState(
                {
                  gotoreView: next,
                  groupId: selected,
                  communityMode: "list",
                  gotoreMotionIndex: historyPosition.current,
                },
                "",
              );
              window.scrollTo({ top: 0 });
            }}
          />
        )}
        {notice && <output className="notice">{notice}</output>}
        {training.finishPending && training.status === "conflict" && (
          <div className="error" role="alert">
            トレーニング記録の確認が必要です。
            <button
              className="text-button"
              type="button"
              onClick={() => setFinishConflictOpen(true)}
            >
              記録を確認
            </button>
          </div>
        )}
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
            today={visibleTodayActivity}
            sharedCache={sharedCache}
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
              setGroupMode("list");
              navigate("groups", "list");
            }}
            onDetail={() => {
              setGroupMode("detail");
              navigate("groups", "detail");
            }}
            active={view === "home"}
          />
        </div>
        <div hidden={view !== "record"}>
          <SessionScreen
            todayActivity={visibleTodayActivity}
            onSelectingChange={setRecordSelecting}
            sharedCache={sharedCache}
            active={view === "record"}
            controller={training}
            userId={session.user.id}
            recent={recentRecords}
            onHistory={() => navigate("history")}
            haptic={preferences.haptic}
            catalog={catalog}
            onFinished={(record) => {
              setFinished(record);
              window.history.replaceState(
                {
                  gotoreView: "result",
                  groupId: selected,
                  gotoreBack: true,
                  gotoreMotionIndex: historyPosition.current,
                },
                "",
              );
              viewRef.current = "result";
              runNavigationMotion(() => {
                viewRef.current = "result";
                setView("result");
                setNotice("");
                window.scrollTo({ top: 0 });
              }, "forward");
            }}
          />
        </div>
        {view === "result" && finished && (
          <WorkoutResult
            record={finished}
            confirmed={resultConfirmed}
            onHistory={() => navigate("history")}
            onHome={() => navigate("home")}
          />
        )}
        <div hidden={view !== "history"} className="personal-history-shell">
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
                historyPosition.current =
                  (Number(window.history.state?.gotoreMotionIndex) || 0) + 1;
                window.history.pushState(
                  {
                    gotoreView: "history",
                    groupId: selected,
                    gotoreBack: true,
                    gotoreMotionIndex: historyPosition.current,
                  },
                  "",
                );
                setEditing(record);
                viewRef.current = "edit";
                runNavigationMotion(() => {
                  viewRef.current = "edit";
                  setView("edit");
                }, "forward");
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
            initialDetail={groupMode === "detail"}
            active={opened && view === "groups"}
            userId={session.user.id}
            refreshKey={refreshKey}
            onSelect={setGroupId}
            onModeChange={setGroupMode}
            onOrder={(ids) => {
              groupOrder.save(ids);
              setGroupId(selected);
            }}
            onChanged={() => {
              setGroupRefreshKey((key) => key + 1);
              changed();
            }}
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
              disabled={
                training.busy ||
                !training.ready ||
                training.finishPending ||
                !!training.session?.exercises.length
              }
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
        {finishConflictOpen && training.finishRecord && (
          <Sheet title="端末のトレーニング記録" onClose={() => setFinishConflictOpen(false)}>
            <p>別の更新があるため終了を確認できません。端末の記録を確認してから進めてください。</p>
            <textarea
              aria-label="端末に残っている記録"
              readOnly
              rows={8}
              value={training.finishRecord.exercises
                .map(
                  (exercise) =>
                    `${exercise.name}\n${exercise.sets.map((set, index) => `${index + 1}: ${set.weight}kg × ${set.reps}`).join("\n")}`,
                )
                .join("\n\n")}
            />
            <button
              type="button"
              className="secondary full"
              onClick={async () => {
                if (!window.confirm("端末の記録を破棄し、サーバーの記録を採用しますか？")) return;
                try {
                  await training.discardPending();
                  setFinishConflictOpen(false);
                  setFinished(null);
                  navigate("home");
                } catch {
                  setNotice("記録を読み直せませんでした。もう一度お試しください。");
                }
              }}
            >
              サーバーの記録を採用
            </button>
          </Sheet>
        )}
      </main>
      {primaryView && (
        <FloatingTraining
          userId={session.user.id}
          resumable={resumable}
          disabled={!canStart}
          onActivate={startOrResume}
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
                if (view === "groups") {
                  setGroupMode("list");
                  const state = {
                    ...window.history.state,
                    gotoreView: "groups",
                    groupId: selected,
                    communityMode: "list",
                  };
                  window.history.replaceState(state, "");
                  window.dispatchEvent(new PopStateEvent("popstate", { state }));
                  scrollPageToTop();
                } else {
                  const requiresGroup = ["detail", "invite", "members"].includes(groupMode);
                  const destination =
                    requiresGroup && !groups.some((group) => group.id === groupId)
                      ? "list"
                      : groupMode;
                  if (destination !== groupMode) setGroupMode(destination);
                  navigate(next, destination);
                }
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
