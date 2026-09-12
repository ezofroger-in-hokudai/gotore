import {
  type Group,
  type GroupActivity,
  type GroupDetail,
  type GroupSummary,
  api,
} from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { AnalyticsPanel } from "../analytics/panel";
import { GroupScoreWeights } from "../score/group-score-weights";
import { ScoreBadge } from "../score/score-display";
import { GroupNameForm } from "../training/group-name-form";
import { InviteCodePanel } from "../training/invite-code-panel";
import { MembershipPanel } from "../training/membership-panel";
import { ResourceError } from "../training/resource-error";
import { useResource } from "../training/use-resource";
import { Avatar } from "./avatar";
import { memberIsLive, relativeTime, useLiveClock } from "./live-presence";
import { GROUP_REFRESH_MS, activityRefreshMs, summaryRefreshMs } from "./refresh-interval";
import { SharedWorkoutDetail } from "./shared-workout-detail";
import { Sheet } from "./sheet";
import { useSharedWorkoutDetails } from "./use-shared-workout-details";

export function CommunityHome({
  groups,
  selected,
  onSelect,
  onGroups,
  onDetail,
  refreshKey,
  active,
  loading = false,
  failed = false,
}: {
  groups: Group[];
  selected: string;
  onSelect: (id: string) => void;
  onGroups: () => void;
  onDetail: () => void;
  refreshKey: number;
  active: boolean;
  loading?: boolean;
  failed?: boolean;
}) {
  const carousel = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  useEffect(() => {
    if (!active) {
      restored.current = false;
      return;
    }
    if (restored.current || !carousel.current || !groups.length) return;
    const index = Math.max(
      0,
      groups.findIndex((group) => group.id === selected),
    );
    const card = carousel.current.children[index] as HTMLElement | undefined;
    if (card) carousel.current.scrollLeft = card.offsetLeft;
    restored.current = true;
  }, [groups, selected, active]);
  const activity = useResource<GroupActivity>(
    selected ? `/groups/${selected}/activity` : null,
    refreshKey,
    activityRefreshMs,
    true,
    { enabled: active },
  );
  const summaries = useResource<GroupSummary[]>(
    "/groups/activity/summary",
    refreshKey,
    summaryRefreshMs,
    true,
    { enabled: active && groups.length > 1 },
  );
  function select(index: number) {
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
      <div className="section-heading">
        <h1>ホーム</h1>
        <button className="text-button" type="button" onClick={onGroups}>
          グループ一覧
        </button>
      </div>
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
          <output className="resource-status muted" />
          <div className="resource-placeholder">
            {failed ? "グループを取得できませんでした" : "読み込み中…"}
          </div>
        </>
      ) : !groups.length ? (
        <div className="panel empty-community">
          <h2>仲間と、続けよう。</h2>
          <p>グループを作成するか、招待コードで参加しましょう。</p>
          <button className="primary full" type="button" onClick={onGroups}>
            作成・参加
          </button>
        </div>
      ) : (
        <>
          <div
            className="group-carousel"
            ref={carousel}
            onScroll={() => {
              const element = carousel.current;
              if (!active || !element?.clientWidth) return;
              const width = (element.firstElementChild as HTMLElement)?.offsetWidth + 12;
              const index = Math.min(
                groups.length - 1,
                Math.max(0, Math.round(element.scrollLeft / width)),
              );
              if (groups[index].id !== selected) onSelect(groups[index].id);
            }}
          >
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                active={active}
                data={
                  group.id === selected
                    ? activity.data
                    : (summaries.data?.find((item) => item.group_id === group.id) ?? null)
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
          <div className="section-heading">
            <h2>みんなの最新記録</h2>
            <span className="muted">{groups.find((group) => group.id === selected)?.name}</span>
          </div>
          <output className="resource-status muted">
            {activity.loading && activity.data ? "更新中…" : ""}
          </output>
          <ResourceError resource={activity} />
          {activity.data ? (
            <Feed
              key={activity.data.group_id}
              data={activity.data}
              active={active}
              trusted={!activity.refreshing}
            />
          ) : !activity.error ? (
            <div className="resource-placeholder">読み込み中…</div>
          ) : null}
        </>
      )}
    </>
  );
}

function GroupCard({
  group,
  data,
  error,
  refreshing,
  active,
  onClick,
}: {
  group: Group;
  data: GroupSummary | null;
  error: string;
  refreshing: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="community-card"
      type="button"
      onClick={onClick}
      aria-label={`${group.name}の詳細`}
    >
      <div className="section-heading">
        <h2>{group.name}</h2>
        <span>›</span>
      </div>
      {error && <p>{data ? "更新未確認" : "状況を取得できません"}</p>}
      {error && !data ? null : <CommunityStats data={data} active={active} trusted={!refreshing} />}
      <span className="community-total">メンバー {data?.member_count ?? "—"}人</span>
    </button>
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
  const [opened, setOpened] = useState<string | null>(null);
  const details = useSharedWorkoutDetails(data, active && trusted, opened);
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
        {!data.feed.length && (
          <p className="muted feed-empty">まだ記録がありません。最初のセットを残しましょう。</p>
        )}
        {data.feed.map((item) => {
          const member = data.members.find((m) => m.id === item.user_id);
          const live = clock.live && !!member && memberIsLive(member, clock.now);
          return (
            <article
              className={`feed-item${live ? " feed-live" : ""}${arrived.includes(item.user_id) ? " feed-arrived" : ""}`}
              key={item.user_id}
              data-workout-id={item.workout_id}
            >
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
              <button
                type="button"
                className="feed-record-row feed-detail-button"
                aria-label={`${item.display_name}の記録詳細を開く`}
                onClick={() => setOpened(item.workout_id)}
              >
                <span className="feed-value">
                  <strong>
                    {item.weight}
                    <small> kg × </small>
                    {item.reps}
                    <small> 回</small>
                  </strong>
                  {item.best && (
                    <span className="best-badge record-celebration">
                      <span role="img" aria-label="最高記録">
                        🔥
                      </span>
                    </span>
                  )}
                  <span className="feed-detail-hint">詳細</span>
                </span>
                <ScoreBadge score={item.score} />
              </button>
            </article>
          );
        })}
      </div>
      {opened && active && (
        <SharedWorkoutDetail
          key={`${data.group_id}:${opened}`}
          record={details}
          onClose={() => setOpened(null)}
        />
      )}
    </>
  );
}

type Preview = {
  id: string;
  name: string;
  member_count: number;
  already_member: boolean;
};
type Mode = "list" | "detail" | "create" | "join" | "members" | "invite" | "weights";
export function CommunityScreen({
  groups,
  selected,
  initialDetail,
  active,
  userId,
  refreshKey,
  onSelect,
  onChanged,
  onHome,
}: {
  groups: Group[];
  selected: string;
  initialDetail: boolean;
  active: boolean;
  userId: string;
  refreshKey: number;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onHome: () => void;
}) {
  const [analyticsTab, setAnalyticsTab] = useState<"feed" | "graph" | "ranking">("feed");
  const [mode, setMode] = useState<Mode>(initialDetail ? "detail" : "list");
  useEffect(() => {
    if (active) setMode(initialDetail ? "detail" : "list");
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
          ["list", "detail", "create", "join", "members", "invite", "weights"].includes(next)
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
          <h1>グループ一覧</h1>
          <div className="v2-rows">
            {groups.map((item) => (
              <button
                className="v2-row"
                type="button"
                key={item.id}
                onClick={() => {
                  onSelect(item.id);
                  change("detail", item.id);
                }}
              >
                <span>{item.name}</span>
                <span>›</span>
              </button>
            ))}
          </div>
          <button className="primary full" type="button" onClick={() => change("create")}>
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
              {mode === "weights" && (
                <GroupScoreWeights groupId={group.id} editable={group.owner_id === userId} />
              )}
              {mode === "detail" && (
                <>
                  <div className="analytics-tabs" aria-label="グループの表示">
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
                    <AnalyticsPanel
                      key={selected}
                      scope={`/groups/${selected}`}
                      active={active && analyticsTab !== "feed"}
                      prefetch={active}
                      refreshKey={refreshKey}
                      ranking={analyticsTab === "ranking"}
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
                          <button
                            className="v2-row"
                            type="button"
                            onClick={() => change("weights")}
                          >
                            SCOREの配点 <span>›</span>
                          </button>
                        </div>
                        <h2>みんなの最新記録</h2>
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
                  <p className="muted">このコードを仲間に伝えてください。</p>
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
              <div className="resource-placeholder">読み込み中…</div>
              {mode === "detail" && <h2>みんなの最新記録</h2>}
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
