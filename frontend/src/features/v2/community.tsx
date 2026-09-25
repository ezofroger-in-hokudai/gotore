import {
  type Group,
  type GroupActivity,
  type GroupDetail,
  type GroupSummary,
  type TodayActivity,
  api,
} from "@/lib/api";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { LoadingState } from "../loading/loading-state";
import { StampInboxButton } from "../stamps/inbox";
import { StampControl } from "../stamps/stamp-control";
import { BestFlame } from "../training/best-flame";
import { GroupNameForm } from "../training/group-name-form";
import { InviteCodePanel } from "../training/invite-code-panel";
import { MembershipPanel } from "../training/membership-panel";
import { RecordList } from "../training/record-list";
import { ResourceError } from "../training/resource-error";
import { useResource } from "../training/use-resource";
import { Avatar } from "./avatar";
import { HistoryBrowser } from "./history-browser";
import { memberIsLive, relativeTime, useLiveClock } from "./live-presence";
import {
  GROUP_REFRESH_MS,
  activityRefreshMs,
  summaryRefreshMs,
  todayActivityRefreshMs,
} from "./refresh-interval";
import { SharedWorkoutDetail } from "./shared-workout-detail";
import { Sheet } from "./sheet";
import { useGroupActivity } from "./use-group-activity";
import { useGroupCardDrag } from "./use-group-card-drag";
import { useGroupLongPress } from "./use-group-long-press";
import { useSharedWorkoutDetails } from "./use-shared-workout-details";

export function CommunityHome({
  groups,
  selected,
  onSelect,
  onGroups,
  onOrder,
  onDetail,
  refreshKey,
  active,
  loading = false,
  failed = false,
  trainingAction,
  onReady,
}: {
  groups: Group[];
  selected: string;
  onSelect: (id: string) => void;
  onGroups: () => void;
  onOrder: (ids: string[]) => void;
  onDetail: () => void;
  refreshKey: number;
  active: boolean;
  loading?: boolean;
  failed?: boolean;
  trainingAction?: ReactNode;
  onReady?: (ready: boolean) => void;
}) {
  const carousel = useRef<HTMLDivElement>(null);
  const cardDrag = useGroupCardDrag({
    carousel,
    groups,
    selected,
    active,
    onSave: onOrder,
    onSelect,
    onOpen: (id) => {
      onSelect(id);
      onDetail();
    },
  });
  const restored = useRef("");
  const groupIds = groups.map((group) => group.id).join(",");
  useLayoutEffect(() => {
    if (!active) {
      restored.current = "";
      return;
    }
    if (cardDrag.drag) {
      restored.current = "";
      return;
    }
    if (restored.current === groupIds || !carousel.current || !groups.length) return;
    const index = Math.max(
      0,
      groups.findIndex((group) => group.id === selected),
    );
    const card = carousel.current.children[index] as HTMLElement | undefined;
    if (card) carousel.current.scrollLeft = card.offsetLeft;
    restored.current = groupIds;
  }, [groups, groupIds, selected, active, cardDrag.drag]);
  const activity = useGroupActivity(groups, selected, active, refreshKey);
  const summaries = useResource<GroupSummary[]>(
    "/groups/activity/summary",
    refreshKey,
    summaryRefreshMs,
    true,
    { enabled: active && groups.length > 1 },
  );
  const today = useResource<TodayActivity>(
    "/groups/today-activity",
    refreshKey,
    todayActivityRefreshMs,
    true,
    { enabled: active && groups.length > 0, retainOnRefresh: true },
  );
  const ready =
    !loading &&
    (!groups.length ||
      ((!!activity.data || !!activity.error) &&
        (groups.length < 2 || summaries.data !== null || !!summaries.error)));
  useEffect(() => {
    onReady?.(ready || failed);
  }, [ready, failed, onReady]);
  function select(index: number) {
    cardDrag.cancel();
    const element = carousel.current?.children[index] as HTMLElement | undefined;
    if (element && carousel.current)
      carousel.current.scrollTo({
        left: element.offsetLeft,
        behavior: "instant",
      });
    onSelect(groups[index].id);
  }
  return (
    <>
      <HomeSummary data={today.data} />
      {loading ? (
        <>
          <div
            className="community-card"
            aria-label={failed ? "グループ未取得" : "グループを読み込み中"}
          >
            <h2>グループ</h2>
            <CommunityStats data={null} />
            <span className="community-total">メンバー —人</span>
          </div>
          <div className="carousel-dots" />
          <div className="section-heading">
            <h2>みんなの最新記録</h2>
          </div>
          {failed ? (
            <div className="resource-placeholder">グループを取得できませんでした</div>
          ) : (
            <LoadingState label="グループを読み込み中" />
          )}
          <StampInboxButton groupId={selected || undefined} active={active} />
          {trainingAction}
        </>
      ) : !groups.length ? (
        <>
          <div className="panel empty-community">
            <h2>グループはありません</h2>
            <button className="primary full" type="button" onClick={onGroups}>
              作成・参加
            </button>
          </div>
          {trainingAction}
        </>
      ) : (
        <>
          <div
            className={`group-carousel${cardDrag.drag ? " is-reordering" : ""}`}
            ref={carousel}
            {...cardDrag.handlers}
            onScroll={() => {
              const element = carousel.current;
              if (!active || cardDrag.isMoving() || !element?.clientWidth) return;
              const width = (element.firstElementChild as HTMLElement)?.offsetWidth + 12;
              const index = Math.min(
                groups.length - 1,
                Math.max(0, Math.round(element.scrollLeft / width)),
              );
              if (groups[index].id !== selected) onSelect(groups[index].id);
            }}
          >
            {groups.map((group, index) => (
              <GroupCard
                key={group.id}
                group={group}
                dragging={cardDrag.drag?.id === group.id}
                style={cardDrag.style(group.id, index)}
                active={active}
                data={
                  today.data?.groups.find((item) => item.group_id === group.id) ??
                  (group.id === selected
                    ? activity.data
                    : (summaries.data?.find((item) => item.group_id === group.id) ?? null))
                }
                error={group.id === selected ? activity.error : summaries.error}
                refreshing={group.id === selected ? activity.refreshing : summaries.refreshing}
                onClick={() => {
                  onSelect(group.id);
                  onDetail();
                }}
              />
            ))}
          </div>
          {cardDrag.drag && (
            <output className="sr-only">
              {groups.find((group) => group.id === cardDrag.drag?.id)?.name}
              を移動中。
              {cardDrag.drag.target + 1}番目
            </output>
          )}
          {cardDrag.error && (
            <p className="error" role="alert">
              {cardDrag.error}
            </p>
          )}
          {groups.length > 1 && (
            <ResourceError resource={summaries} retryLabel="グループの状況を再試行" />
          )}
          <div className="carousel-dots">
            {groups.map((group, index) => (
              <button
                key={group.id}
                type="button"
                aria-label={`${group.name}を表示`}
                aria-pressed={selected === group.id}
                onClick={() => select(index)}
              />
            ))}
          </div>
          <div className="section-heading home-timeline-heading">
            <h2>みんなのトレーニング</h2>
            <span className="muted">{groups.find((group) => group.id === selected)?.name}</span>
          </div>
          <ResourceError resource={activity} />
          {activity.data ? (
            <Feed
              key={activity.data.group_id}
              data={activity.data}
              active={active}
              trusted={!activity.refreshing}
            />
          ) : !activity.error ? (
            <LoadingState label="グループの記録を読み込み中" />
          ) : null}
          <StampInboxButton groupId={selected || undefined} active={active} />
          {trainingAction}
        </>
      )}
    </>
  );
}

function HomeSummary({ data }: { data: TodayActivity | null }) {
  const groups = data?.groups ?? [];
  const members = groups.flatMap((group) => group.members);
  const workouts = new Map(
    groups.flatMap((group) => group.feed.map((item) => [item.workout_id, item])),
  );
  const live = new Set(members.filter((member) => member.live).map((member) => member.id)).size;
  const todayPeople = new Set(members.filter((member) => member.today).map((member) => member.id))
    .size;
  const sets = [...workouts.values()].reduce(
    (sum, item) => sum + (item.summary?.set_count ?? 0),
    0,
  );
  const volume = [...workouts.values()].reduce(
    (sum, item) => sum + (item.summary?.total_volume ?? 0),
    0,
  );
  return (
    <section className="home-summary" aria-label="今日の活動">
      {[
        ["LIVE", data ? live : "—", "人"],
        ["今日", data ? todayPeople : "—", "人"],
        ["セット", data ? sets : "—", ""],
        ["総負荷", data ? volume.toLocaleString("ja-JP", { maximumFractionDigits: 0 }) : "—", "kg"],
      ].map(([label, value, unit], index) => (
        <div key={label}>
          <span className={index === 0 ? "home-summary-live" : undefined}>
            {index === 0 && <span className="status-dot" />}
            {label}
          </span>
          <strong>
            {value}
            <small>{unit}</small>
          </strong>
        </div>
      ))}
    </section>
  );
}

function GroupCard({
  group,
  data,
  error,
  refreshing,
  active,
  onClick,
  dragging,
  style,
}: {
  group: Group;
  data: GroupSummary | null;
  error: string;
  refreshing: boolean;
  active: boolean;
  onClick: () => void;
  dragging: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      className={`community-card${dragging ? " is-dragging" : ""}`}
      data-group-id={group.id}
      style={style}
      type="button"
      onClick={onClick}
      aria-label={`${group.name}の詳細`}
    >
      <div className="section-heading">
        <h2>{group.name}</h2>
        <span>›</span>
      </div>
      {error && <p>{data ? "更新未確認" : "状況を取得できません"}</p>}
      {error && !data ? null : <GroupCardStats data={data} active={active} trusted={!refreshing} />}
    </button>
  );
}

function GroupCardStats({
  data,
  active,
  trusted,
}: {
  data: GroupSummary | GroupActivity | null;
  active: boolean;
  trusted: boolean;
}) {
  const clock = useLiveClock(data, active, trusted);
  const live = data?.members.filter(
    (member) => clock.live && memberIsLive(member, clock.now),
  ).length;
  const feed = data && "feed" in data ? data.feed : [];
  const sets = feed.reduce((sum, item) => sum + (item.summary?.set_count ?? 0), 0);
  const volume = feed.reduce((sum, item) => sum + (item.summary?.total_volume ?? 0), 0);
  return (
    <div className="group-card-stats">
      <span className={live ? "is-live" : undefined}>
        <span className="status-dot" />
        LIVE <b>{data ? live : "—"}</b>
      </span>
      <span>
        セット <b>{data && "feed" in data ? sets : "—"}</b>
      </span>
      <span>
        総負荷{" "}
        <b>
          {data && "feed" in data
            ? volume.toLocaleString("ja-JP", { maximumFractionDigits: 0 })
            : "—"}
          <small>kg</small>
        </b>
      </span>
    </div>
  );
}

function CommunityStats({
  data,
  active = false,
  trusted = true,
}: {
  data: GroupSummary | null;
  active?: boolean;
  trusted?: boolean;
}) {
  const clock = useLiveClock(data, active, trusted);
  const liveMembers =
    data?.members.filter((member) => clock.live && memberIsLive(member, clock.now)) ?? [];
  return (
    <div className="community-stats">
      {(["live", "today"] as const).map((kind) => (
        <div key={kind}>
          <span
            className={`stat-label${kind === "live" && liveMembers.length ? " stat-live" : ""}`}
          >
            {kind === "live" && (
              <span
                className={liveMembers.length ? "live-pulse" : "live-idle"}
                aria-hidden="true"
              />
            )}
            {kind.toUpperCase()}
          </span>
          <strong>
            {data
              ? kind === "live"
                ? clock.live
                  ? liveMembers.length
                  : "—"
                : data.today_count
              : "—"}
            <small>人</small>
          </strong>
          <div className="mini-avatars">
            {(kind === "live"
              ? liveMembers
              : (data?.members.filter((member) => member.today) ?? [])
            )
              .slice(0, 5)
              .map((member) => (
                <Avatar
                  key={member.id}
                  userId={member.id}
                  name={member.display_name}
                  version={member.avatar_version}
                  small
                  live={clock.live && memberIsLive(member, clock.now)}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Feed({
  data,
  active,
  trusted,
}: { data: GroupActivity; active: boolean; trusted: boolean }) {
  const clock = useLiveClock(data, active, trusted);
  const details = useSharedWorkoutDetails(data, active && trusted, null);
  const previous = useRef<Map<string, string> | null>(null);
  const [arrived, setArrived] = useState<string[]>([]);
  useEffect(() => {
    if (!active || !trusted) {
      previous.current = null;
      setArrived([]);
      return;
    }
    const next = new Map(
      data.feed.map((item) => [
        item.user_id,
        JSON.stringify([item.workout_id, item.updated_at, item.exercise, item.weight, item.reps]),
      ]),
    );
    const changes = previous.current
      ? Array.from(next.keys()).filter((id) => previous.current?.get(id) !== next.get(id))
      : [];
    previous.current = next;
    setArrived(changes);
    if (!changes.length) return;
    const timer = window.setTimeout(() => setArrived([]), 4000);
    return () => window.clearTimeout(timer);
  }, [data.feed, active, trusted]);
  return (
    <>
      <div className="community-feed" ref={details.root}>
        {!data.feed.length && <p className="muted feed-empty">まだ記録がありません。</p>}
        {data.feed.map((item) => {
          const member = data.members.find((m) => m.id === item.user_id);
          const live = clock.live && !!member && memberIsLive(member, clock.now);
          const record = details.record(item.workout_id).data;
          return (
            <div
              className={`feed-item${live ? " feed-live" : ""}${arrived.includes(item.user_id) ? " feed-arrived" : ""}`}
              key={item.workout_id}
              data-workout-id={item.workout_id}
            >
              {record ? (
                <RecordList
                  records={[record]}
                  empty=""
                  headerControl={() => (
                    <StampControl
                      active={active}
                      groupId={data.group_id}
                      workoutId={item.workout_id}
                      name={item.display_name}
                    />
                  )}
                />
              ) : (
                <>
                  <div className="section-heading">
                    <div className="feed-person">
                      <Avatar
                        userId={item.user_id}
                        name={item.display_name}
                        version={member?.avatar_version}
                        live={live}
                      />
                      <div>
                        <div className="feed-name">
                          <strong>{item.display_name}</strong>
                          {live && (
                            <span className="live-badge" aria-label="トレーニング中">
                              LIVE
                            </span>
                          )}
                        </div>
                        <p>{item.exercise}</p>
                      </div>
                    </div>
                    <time
                      dateTime={item.updated_at}
                      title={new Date(item.updated_at).toLocaleString("ja-JP", {
                        timeZone: "Asia/Tokyo",
                      })}
                    >
                      {relativeTime(item.updated_at, clock.now)}
                    </time>
                  </div>
                  <div className="feed-record-row">
                    {item.summary && (
                      <span className="feed-summary">
                        <strong>{item.summary.exercise_count}</strong>種目
                        <span aria-hidden="true"> · </span>
                        <strong>{item.summary.set_count}</strong>セット
                      </span>
                    )}
                    <span className="feed-value">
                      <span className="feed-measurements">
                        <strong>
                          <b className={item.best_weight ? "personal-best-value" : undefined}>
                            {item.weight}
                          </b>
                          <small> kg × </small>
                          {item.reps}
                          <small> 回</small>
                        </strong>
                        {item.estimated_rm !== null && (
                          <span className="feed-rm">
                            RM{" "}
                            <b className={item.best_rm ? "personal-best-value" : undefined}>
                              {item.estimated_rm}
                            </b>
                            <small> kg</small>
                          </span>
                        )}
                      </span>
                      {item.best && (
                        <span className="best-badge record-celebration">
                          <BestFlame best={{ weight: item.best_weight, rm: item.best_rm }} />
                        </span>
                      )}
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

type Preview = {
  id: string;
  name: string;
  member_count: number;
  already_member: boolean;
};
type Mode = "list" | "detail" | "create" | "join" | "members" | "invite";
export function CommunityScreen({
  guideTarget,
  groups,
  selected,
  initialDetail,
  active,
  userId,
  refreshKey,
  onSelect,
  onChanged,
  onHome,
  onReorder,
}: {
  guideTarget?: { target: string } | null;
  groups: Group[];
  selected: string;
  initialDetail: boolean;
  active: boolean;
  userId: string;
  refreshKey: number;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onHome: () => void;
  onReorder: () => void;
}) {
  const [analyticsTab, setAnalyticsTab] = useState<"feed" | "calendar" | "graph" | "ranking">(
    "feed",
  );
  const [mode, setMode] = useState<Mode>(initialDetail ? "detail" : "list");
  useEffect(() => {
    if (guideTarget?.target === "groups") setMode("list");
  }, [guideTarget]);
  useEffect(() => {
    if (active) {
      const restoredMode = window.history.state?.communityMode;
      setMode(
        ["list", "detail", "members", "invite", "create", "join"].includes(restoredMode)
          ? restoredMode
          : initialDetail
            ? "detail"
            : "list",
      );
    }
  }, [active, initialDetail]);
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const back = (event: PopStateEvent) => {
      if (event.state?.gotoreView === "groups") {
        const next = event.state.communityMode;
        setMode(
          ["list", "detail", "create", "join", "members", "invite"].includes(next)
            ? next
            : initialDetail
              ? "detail"
              : "list",
        );
        setPreview(null);
        setError("");
      }
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [initialDetail]);
  const detail = useResource<GroupDetail>(
    selected ? `/groups/${selected}` : null,
    refreshKey,
    GROUP_REFRESH_MS,
    true,
    { enabled: active && mode !== "list", retainOnRefresh: true },
  );
  const activity = useResource<GroupActivity>(
    selected ? `/groups/${selected}/activity` : null,
    refreshKey,
    activityRefreshMs,
    true,
    { enabled: active && mode === "detail" && analyticsTab === "feed" },
  );
  const group = detail.data;
  function change(next: Mode, groupId = selected) {
    const previous = { ...window.history.state };
    previous.gotoreSheet = undefined;
    window.history.pushState(
      {
        ...previous,
        gotoreView: "groups",
        communityMode: next,
        groupId,
      },
      "",
    );
    setMode(next);
    setValue("");
    setPreview(null);
    setError("");
  }
  async function submit(join = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "join" && !join) {
        setPreview(
          await api<Preview>("/groups/preview", {
            method: "POST",
            body: JSON.stringify({ invite_code: value.trim().toUpperCase() }),
          }),
        );
      } else {
        const result = await api<Group>(mode === "create" ? "/groups" : "/groups/join", {
          method: "POST",
          body: JSON.stringify(
            mode === "create"
              ? { name: value.trim() }
              : { invite_code: value.trim().toUpperCase() },
          ),
        });
        onSelect(result.id);
        onChanged();
        change(mode === "create" ? "invite" : "detail", result.id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="community-screen">
      <button
        type="button"
        className="text-button back-button"
        onClick={() => (mode === "list" ? onHome() : change("list"))}
      >
        ‹ {mode === "list" ? "ホーム" : "グループ一覧"}
      </button>
      {mode === "list" ? (
        <>
          <div className="section-heading">
            <h1>グループ一覧</h1>
            {groups.length > 1 && (
              <button type="button" className="text-button" onClick={onReorder}>
                並べ替え
              </button>
            )}
          </div>
          <div className="v2-rows">
            {groups.map((item) => (
              <GroupListRow
                key={item.id}
                group={item}
                active={active && mode === "list"}
                onReorder={groups.length > 1 ? onReorder : undefined}
                onClick={() => {
                  onSelect(item.id);
                  change("detail", item.id);
                }}
              />
            ))}
          </div>
          <button
            className="primary full"
            data-tour="groups"
            type="button"
            onClick={() => change("create")}
          >
            グループを作成
          </button>
          <button className="secondary full" type="button" onClick={() => change("join")}>
            招待コードで参加
          </button>
        </>
      ) : mode === "create" || mode === "join" ? (
        <>
          <h1>{mode === "create" ? "グループを作成" : "招待コードで参加"}</h1>
          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <fieldset disabled={busy}>
              <label>
                {mode === "create" ? "グループ名" : "招待コード"}
                <input
                  required
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setPreview(null);
                  }}
                  minLength={mode === "join" ? 12 : 1}
                  maxLength={mode === "join" ? 12 : 40}
                  pattern={mode === "join" ? "[A-Fa-f0-9]{12}" : undefined}
                  placeholder={mode === "join" ? "12桁の招待コード" : "例：いつものトレ仲間"}
                  autoComplete="off"
                />
              </label>
              <button className="primary full" type="submit">
                {busy ? "確認中…" : mode === "create" ? "作成する" : "グループを確認"}
              </button>
            </fieldset>
          </form>
        </>
      ) : (
        <>
          {detail.error && !group ? (
            <p className="error" role="alert">
              {detail.error}
              <button type="button" className="text-button" onClick={detail.retry}>
                再試行
              </button>
            </p>
          ) : group ? (
            <>
              <ResourceError resource={detail} />
              <h1>{group.name}</h1>
              <StampInboxButton groupId={selected} active={active} />

              {mode === "detail" && (
                <>
                  <div className="analytics-tabs" aria-label="グループの表示">
                    <button
                      type="button"
                      aria-pressed={analyticsTab === "calendar"}
                      onClick={() => setAnalyticsTab("calendar")}
                    >
                      カレンダー
                    </button>
                    <button
                      type="button"
                      aria-pressed={analyticsTab === "feed"}
                      onClick={() => setAnalyticsTab("feed")}
                    >
                      最新記録
                    </button>
                    <button
                      type="button"
                      aria-pressed={analyticsTab === "graph"}
                      onClick={() => setAnalyticsTab("graph")}
                    >
                      グラフ
                    </button>
                    <button
                      type="button"
                      aria-pressed={analyticsTab === "ranking"}
                      onClick={() => setAnalyticsTab("ranking")}
                    >
                      ランキング
                    </button>
                  </div>
                  <div hidden={analyticsTab === "feed"}>
                    <HistoryBrowser
                      key={selected}
                      userId={userId}
                      scope={`/groups/${selected}`}
                      members={group.members}
                      active={active && analyticsTab !== "feed"}
                      prefetch={false}
                      refreshKey={refreshKey}
                      tab={analyticsTab === "feed" ? "calendar" : analyticsTab}
                    />
                  </div>
                  <div hidden={analyticsTab !== "feed"}>
                    <ResourceError resource={activity} />
                    {activity.error && !activity.data ? null : (
                      <>
                        <div className="community-card detail-card">
                          <CommunityStats
                            data={activity.data}
                            active={active}
                            trusted={!activity.refreshing}
                          />
                          <span className="community-total">メンバー {group.members.length}人</span>
                        </div>
                        <div className="v2-rows">
                          <button
                            className="v2-row"
                            type="button"
                            onClick={() => change("members")}
                          >
                            メンバー一覧 <span>{group.members.length}人 ›</span>
                          </button>
                          <button className="v2-row" type="button" onClick={() => change("invite")}>
                            メンバーを招待 <span>›</span>
                          </button>
                        </div>
                        {activity.data && (
                          <Feed
                            key={activity.data.group_id}
                            data={activity.data}
                            active={active}
                            trusted={!activity.refreshing}
                          />
                        )}
                      </>
                    )}
                  </div>
                  {group.owner_id === userId && (
                    <details className="group-management">
                      <summary>グループを管理</summary>
                      <GroupNameForm group={group} onSaved={onChanged} />
                    </details>
                  )}
                </>
              )}
              {mode === "members" && (
                <>
                  <h2>メンバー一覧</h2>
                  <MembershipPanel
                    group={group}
                    userId={userId}
                    onChanged={(left) => {
                      onChanged();
                      if (left) onHome();
                    }}
                  />
                </>
              )}
              {mode === "invite" && (
                <>
                  <h2>招待コード</h2>
                  <InviteCodePanel
                    group={group}
                    owner={group.owner_id === userId}
                    onRenewed={onChanged}
                  />
                  <button className="primary full" type="button" onClick={onHome}>
                    ホームへ
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <h1>{groups.find((item) => item.id === selected)?.name || "グループ"}</h1>
              <div className="community-card detail-card">
                <CommunityStats data={null} />
              </div>
              <LoadingState label="グループの記録を読み込み中" />
            </>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <Sheet
          title="このグループに参加しますか？"
          onClose={() => {
            if (!busy) setPreview(null);
          }}
        >
          <h3>{preview.name}</h3>
          <p>メンバー {preview.member_count}人</p>
          <p className="muted">参加後に開始するトレーニングから共有されます。</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary full"
            type="button"
            disabled={busy}
            onClick={() => void submit(true)}
          >
            {preview.already_member ? "参加済みのグループを開く" : "参加する"}
          </button>
        </Sheet>
      )}
    </section>
  );
}

function GroupListRow({
  group,
  active,
  onClick,
  onReorder,
}: {
  group: Group;
  active: boolean;
  onClick: () => void;
  onReorder?: () => void;
}) {
  const longPress = useGroupLongPress(onReorder, active);
  return (
    <button className="v2-row group-order-entry" type="button" {...longPress} onClick={onClick}>
      <span>{group.name}</span>
      <span>›</span>
    </button>
  );
}
