import { type Group, type GroupActivity, type GroupDetail, api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { GroupNameForm } from "../training/group-name-form";
import { InviteCodePanel } from "../training/invite-code-panel";
import { MembershipPanel } from "../training/membership-panel";
import { useResource } from "../training/use-resource";
import { Sheet } from "./sheet";

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
    active,
    true,
    { enabled: active },
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
                refreshKey={refreshKey}
                active={active}
                selectedActivity={group.id === selected ? activity : undefined}
                onClick={() => {
                  onSelect(group.id);
                  onDetail();
                }}
              />
            ))}
          </div>
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
          {activity.error ? (
            <p role="alert" className="error">
              {activity.error}
              <button type="button" className="text-button" onClick={activity.retry}>
                再試行
              </button>
            </p>
          ) : activity.data ? (
            <Feed data={activity.data} />
          ) : (
            <div className="resource-placeholder">読み込み中…</div>
          )}
        </>
      )}
    </>
  );
}

function GroupCard({
  group,
  refreshKey,
  active,
  onClick,
  selectedActivity,
}: {
  group: Group;
  refreshKey: number;
  active: boolean;
  onClick: () => void;
  selectedActivity?: ReturnType<typeof useResource<GroupActivity>>;
}) {
  const own = useResource<GroupActivity>(
    selectedActivity ? null : `/groups/${group.id}/activity`,
    refreshKey,
    active,
    true,
    { enabled: active },
  );
  const resource = selectedActivity ?? own;
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
      {resource.error ? <p>状況を取得できません</p> : <CommunityStats data={resource.data} />}
      <span className="community-total">メンバー {resource.data?.member_count ?? "—"}人</span>
    </button>
  );
}

function CommunityStats({ data }: { data: GroupActivity | null }) {
  return (
    <div className="community-stats">
      {(["live", "today"] as const).map((kind) => (
        <div key={kind}>
          <span className="stat-label">
            {kind === "live" && <i className="live-pulse" />} {kind.toUpperCase()}
          </span>
          <strong>
            {data ? (kind === "live" ? data.live_count : data.today_count) : "—"}
            <small>人</small>
          </strong>
          <div className="mini-avatars">
            {data?.members
              .filter((member) => member[kind])
              .slice(0, 5)
              .map((member) => (
                <span
                  key={member.id}
                  title={member.display_name}
                  className={member.live ? "is-live" : ""}
                >
                  {Array.from(member.display_name)[0]}
                </span>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Feed({ data }: { data: GroupActivity }) {
  return (
    <div className="community-feed">
      {!data.feed.length && (
        <p className="muted feed-empty">まだ記録がありません。最初のセットを残しましょう。</p>
      )}
      {data.feed.map((item) => (
        <article className="feed-item" key={item.user_id}>
          <div className="section-heading">
            <div className="feed-person">
              <span
                className={`avatar ${data.members.find((m) => m.id === item.user_id)?.live ? "is-live" : ""}`}
              >
                {Array.from(item.display_name)[0]}
              </span>
              <div>
                <strong>{item.display_name}</strong>
                <p>{item.exercise}</p>
              </div>
            </div>
            <time dateTime={item.updated_at}>
              {new Date(item.updated_at).toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Tokyo",
              })}
              <small>
                {new Date(item.updated_at).toLocaleDateString("ja-JP", {
                  month: "numeric",
                  day: "numeric",
                  timeZone: "Asia/Tokyo",
                })}
              </small>
            </time>
          </div>
          <div className="feed-value">
            <strong>
              {item.weight}
              <small> kg × </small>
              {item.reps}
              <small> 回</small>
            </strong>
            {item.best && (
              <span className="best-badge record-celebration">
                <span aria-hidden="true">🔥 </span>BEST
              </span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

type Preview = { id: string; name: string; member_count: number; already_member: boolean };
type Mode = "list" | "detail" | "create" | "join" | "members" | "invite";
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
    mode === "detail" || mode === "members",
    true,
    { enabled: active && mode !== "list", retainOnRefresh: true },
  );
  const activity = useResource<GroupActivity>(
    selected ? `/groups/${selected}/activity` : null,
    refreshKey,
    true,
    true,
    { enabled: active && mode === "detail" },
  );
  const group = detail.data;
  function change(next: Mode) {
    const previous = { ...window.history.state };
    previous.gotoreSheet = undefined;
    window.history.pushState(
      { ...previous, gotoreView: "groups", communityMode: next, groupId: selected },
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
        change(mode === "create" ? "invite" : "detail");
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
                  change("detail");
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
          {detail.error ? (
            <p className="error" role="alert">
              {detail.error}
              <button type="button" className="text-button" onClick={detail.retry}>
                再試行
              </button>
            </p>
          ) : group ? (
            <>
              <h1>{group.name}</h1>
              {mode === "detail" && (
                <>
                  {activity.error ? (
                    <p className="error" role="alert">
                      {activity.error}
                    </p>
                  ) : (
                    <>
                      <div className="community-card detail-card">
                        <CommunityStats data={activity.data} />
                        <span className="community-total">メンバー {group.members.length}人</span>
                      </div>
                      <div className="v2-rows">
                        <button className="v2-row" type="button" onClick={() => change("members")}>
                          メンバー一覧 <span>{group.members.length}人 ›</span>
                        </button>
                        <button className="v2-row" type="button" onClick={() => change("invite")}>
                          メンバーを招待 <span>›</span>
                        </button>
                      </div>
                      <h2>みんなの最新記録</h2>
                      {activity.data && <Feed data={activity.data} />}
                    </>
                  )}
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
