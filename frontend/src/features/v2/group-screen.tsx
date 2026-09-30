"use client";

import type {
  BodyPart,
  Group,
  GroupActivity,
  GroupDetail,
  TodayActivity,
  TodayGroupActivity,
} from "@/lib/api";
import { api } from "@/lib/api";
import QRCode from "qrcode";
import {
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WombatBarbell } from "../branding/wombat";
import { LoadingState } from "../loading/loading-state";
import { GroupNameForm } from "../training/group-name-form";
import { ResourceError } from "../training/resource-error";
import { useResource } from "../training/use-resource";
import { Avatar } from "./avatar";
import { Feed, GroupCard } from "./community";
import { GroupHistoryCalendar } from "./group-history-calendar";
import { GroupHistoryGraph } from "./group-history-graph";
import { runNavigationMotion } from "./navigation-motion";
import { GROUP_REFRESH_MS, activityRefreshMs } from "./refresh-interval";
import { Sheet } from "./sheet";

type Mode = "list" | "detail" | "create" | "join" | "invite" | "members";
type DetailTab = "latest" | "calendar" | "graph" | "settings";
type InvitePreview = {
  id: string;
  name: string;
  member_count: number;
  already_member: boolean;
  members: { id: string; display_name: string; role: "owner" | "member" }[];
};
type InviteResponse = { token: string; expires_at: string };
type ActionSheet =
  | { type: "leave" }
  | { type: "transfer"; member: GroupDetail["members"][number] }
  | { type: "remove"; member: GroupDetail["members"][number] }
  | { type: "delete" }
  | null;

export function CommunityScreen({
  guideTarget,
  groups,
  today,
  onActivityVisibleChange,
  selected,
  initialDetail,
  active,
  userId,
  refreshKey,
  onSelect,
  onChanged,
  onOrder,
}: {
  guideTarget?: { target: string } | null;
  groups: Group[];
  today: ReturnType<typeof useResource<TodayActivity>>;
  onActivityVisibleChange: (visible: boolean) => void;
  selected: string;
  initialDetail: boolean;
  active: boolean;
  userId: string;
  refreshKey: number;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onOrder: (ids: string[]) => void;
}) {
  const [mode, setMode] = useState<Mode>(initialDetail ? "detail" : "list");
  useEffect(() => {
    onActivityVisibleChange(active && (mode === "list" || mode === "detail"));
  }, [active, mode, onActivityVisibleChange]);
  const modeRef = useRef(mode);
  const activeRef = useRef(active);
  activeRef.current = active;
  const historyPosition = useRef(0);
  const [detailTab, setDetailTab] = useState<DetailTab>("latest");
  const [historySelection, setHistorySelection] = useState<{
    groupId: string;
    part: BodyPart | "all";
  }>({ groupId: selected, part: "all" });
  const historyPart = historySelection.groupId === selected ? historySelection.part : "all";
  const setHistoryPart = (part: BodyPart | "all") =>
    setHistorySelection({ groupId: selected, part });
  const [groupName, setGroupName] = useState("");
  const [createdGroup, setCreatedGroup] = useState<Group | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionSheet, setActionSheet] = useState<ActionSheet>(null);
  const [inviteToken, setInviteToken] = useState("");
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteValue, setInviteValue] = useState("");
  const [memberExpanded, setMemberExpanded] = useState(false);
  const [inviteMembersExpanded, setInviteMembersExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const detail = useResource<GroupDetail>(
    selected ? `/groups/${selected}` : null,
    refreshKey,
    GROUP_REFRESH_MS,
    true,
    {
      enabled: active && mode !== "list" && mode !== "create" && mode !== "join",
      retainOnRefresh: true,
    },
  );
  const group = detail.data;
  const activity = useResource<GroupActivity>(
    selected ? `/groups/${selected}/activity` : null,
    refreshKey,
    activityRefreshMs,
    true,
    { enabled: active && mode === "detail" && detailTab === "latest", retainOnRefresh: true },
  );
  const cardsRef = useRef<HTMLDivElement>(null);

  const handleInvitePreview = useCallback(
    (preview: InvitePreview) => {
      if (!preview.already_member) {
        setInviteMembersExpanded(false);
        setInvitePreview(preview);
        return;
      }
      // 参加済みの招待URLを開き直しても、確認を繰り返さず所属グループへ進む。
      window.history.replaceState(
        {
          ...window.history.state,
          gotoreSheet: undefined,
          gotoreView: "groups",
          communityMode: "detail",
          groupId: preview.id,
        },
        "",
        `${window.location.pathname}${window.location.hash}`,
      );
      onSelect(preview.id);
      onChanged();
      setInvitePreview(null);
      setInviteToken("");
      modeRef.current = "detail";
      runNavigationMotion(() => {
        modeRef.current = "detail";
        setMode("detail");
      }, "forward");
      setDetailTab("latest");
    },
    [onChanged, onSelect],
  );

  useLayoutEffect(() => {
    if (!active) return;
    const restored = window.history.state?.communityMode;
    const next = ["list", "detail", "create", "join", "invite", "members"].includes(restored)
      ? (restored as Mode)
      : initialDetail
        ? "detail"
        : "list";
    modeRef.current = next;
    setMode(next);
    historyPosition.current = Number(window.history.state?.gotoreMotionIndex) || 0;
  }, [active, initialDetail]);

  useEffect(() => {
    if (guideTarget?.target === "groups") {
      modeRef.current = "list";
      setMode("list");
    }
  }, [guideTarget]);

  useEffect(() => {
    const back = (event: PopStateEvent) => {
      if (event.state?.gotoreView !== "groups") return;
      const restored = event.state.communityMode;
      const next: Mode = ["list", "detail", "create", "join", "invite", "members"].includes(
        restored,
      )
        ? restored
        : "list";
      const nextPosition = Number(event.state?.gotoreMotionIndex);
      const direction =
        Number.isFinite(nextPosition) && nextPosition > historyPosition.current
          ? "forward"
          : "back";
      if (Number.isFinite(nextPosition)) historyPosition.current = nextPosition;
      const update = () => {
        modeRef.current = next;
        setMode(next);
        setActionSheet(null);
        setInvitePreview(null);
        setError("");
      };
      if (!activeRef.current || next === modeRef.current) update();
      else {
        modeRef.current = next;
        runNavigationMotion(update, direction);
      }
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  useEffect(() => {
    if (!active) return;
    const token = new URLSearchParams(window.location.search).get("groupInvite");
    if (!token || token === inviteToken) return;
    setInviteToken(token);
    setInvitePreview(null);
    setInviteError("");
    setInviteBusy(true);
    modeRef.current = "join";
    setMode("join");
    api<InvitePreview>("/group-invites/preview", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(handleInvitePreview)
      .catch((reason: unknown) =>
        setInviteError(reason instanceof Error ? reason.message : "招待を確認できません。"),
      )
      .finally(() => setInviteBusy(false));
  }, [active, inviteToken, handleInvitePreview]);

  const groupActivity = useMemo(
    () => new Map((today.data?.groups ?? []).map((item) => [item.group_id, item])),
    [today.data],
  );
  const groupMap = useMemo(() => new Map(groups.map((item) => [item.id, item.name])), [groups]);

  function change(next: Mode, groupId = selected) {
    const previous = { ...window.history.state };
    previous.gotoreSheet = undefined;
    const nextPosition = (Number(previous.gotoreMotionIndex) || 0) + 1;
    window.history.pushState(
      {
        ...previous,
        gotoreView: "groups",
        communityMode: next,
        groupId,
        gotoreBack: true,
        gotoreMotionIndex: nextPosition,
      },
      "",
    );
    historyPosition.current = nextPosition;
    const direction =
      next === "list" || (next === "detail" && ["invite", "members"].includes(modeRef.current))
        ? "back"
        : "forward";
    modeRef.current = next;
    runNavigationMotion(() => {
      modeRef.current = next;
      setMode(next);
      setError("");
      setInviteError("");
      setActionSheet(null);
      setEditingName(false);
    }, direction);
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const name = groupName.trim();
    if (!name || Array.from(name).length > 40) {
      setError("グループ名は1〜40文字です。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api<Group>("/groups", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setCreatedGroup(created);
      onSelect(created.id);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "作成できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function joinFromToken(token: string) {
    if (inviteBusy) return;
    setInviteBusy(true);
    setInviteError("");
    try {
      const joined = await api<Group>("/group-invites/join", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      window.history.replaceState(
        {
          ...window.history.state,
          gotoreSheet: undefined,
          gotoreView: "groups",
          communityMode: "detail",
          groupId: joined.id,
        },
        "",
        `${window.location.pathname}${window.location.hash}`,
      );
      onSelect(joined.id);
      onChanged();
      setInvitePreview(null);
      setInviteToken("");
      modeRef.current = "detail";
      runNavigationMotion(() => {
        modeRef.current = "detail";
        setMode("detail");
      }, "forward");
      setDetailTab("latest");
    } catch (reason) {
      setInviteError(reason instanceof Error ? reason.message : "参加できませんでした。");
    } finally {
      setInviteBusy(false);
    }
  }

  function submitInviteLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const url = new URL(inviteValue.trim());
      const token = url.searchParams.get("groupInvite");
      if (!token) throw new Error("招待リンクを確認してください。");
      setInviteToken(token);
      setInviteBusy(true);
      setInviteError("");
      api<InvitePreview>("/group-invites/preview", {
        method: "POST",
        body: JSON.stringify({ token }),
      })
        .then(handleInvitePreview)
        .catch((reason: unknown) =>
          setInviteError(reason instanceof Error ? reason.message : "招待を確認できません。"),
        )
        .finally(() => setInviteBusy(false));
    } catch (reason) {
      setInviteError(reason instanceof Error ? reason.message : "招待リンクを確認してください。");
    }
  }

  const detailBack = () => {
    setMemberExpanded(false);
    setEditingName(false);
    change(mode === "invite" || mode === "members" ? "detail" : "list");
  };
  const leaveJoin = () => {
    setInviteToken("");
    setInvitePreview(null);
    setInviteMembersExpanded(false);
    window.history.replaceState(
      { ...window.history.state, gotoreView: "groups", communityMode: "list" },
      "",
      `${window.location.pathname}${window.location.hash}`,
    );
    modeRef.current = "list";
    runNavigationMotion(() => {
      modeRef.current = "list";
      setMode("list");
    }, "back");
    setInviteError("");
  };
  const isOwner = !!group && group.owner_id === userId;
  const sortedMembers = useMemo(() => {
    if (!group) return [];
    return group.members
      .map((member, index) => ({ member, index }))
      .sort((a, b) => {
        const activityDifference =
          Date.parse(b.member.last_activity_at ?? "") - Date.parse(a.member.last_activity_at ?? "");
        if (Number.isFinite(activityDifference) && activityDifference !== 0)
          return activityDifference;
        if (a.member.last_activity_at && !b.member.last_activity_at) return -1;
        if (!a.member.last_activity_at && b.member.last_activity_at) return 1;
        return a.index - b.index;
      })
      .map(({ member }) => member);
  }, [group]);

  async function executeOwnerTransfer(member: GroupDetail["members"][number]) {
    setBusy(true);
    setError("");
    try {
      await api(`/groups/${selected}/owner`, {
        method: "PATCH",
        body: JSON.stringify({ member_id: member.id, expected_joined_at: member.joined_at }),
      });
      setActionSheet(null);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "オーナーを変更できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function executeRemoveMember(member: GroupDetail["members"][number]) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/groups/${selected}/members/${member.id}?${new URLSearchParams({ expected_joined_at: member.joined_at })}`,
        { method: "DELETE" },
      );
      setActionSheet(null);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "メンバーを退出させられませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function leaveGroup() {
    if (!group) return;
    const self = group.members.find((member) => member.id === userId);
    if (!self) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/groups/${group.id}/membership?${new URLSearchParams({ expected_joined_at: self.joined_at })}`,
        { method: "DELETE" },
      );
      setActionSheet(null);
      onChanged();
      change("list");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "グループから抜けられませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup() {
    setBusy(true);
    setError("");
    try {
      await api(`/groups/${selected}`, { method: "DELETE" });
      setActionSheet(null);
      onChanged();
      change("list");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "グループを削除できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="community-screen group-screen">
      {mode === "list" && (
        <>
          <div className="section-heading group-screen-heading" data-tour="groups">
            <h1>グループ</h1>
            <div className="group-management-actions">
              <button
                type="button"
                className="group-action-pill"
                onClick={() => {
                  setGroupName("");
                  setCreatedGroup(null);
                  change("create");
                }}
              >
                <span aria-hidden="true">＋</span>作成
              </button>
              <button type="button" className="group-action-pill" onClick={() => change("join")}>
                <span aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <title>参加</title>
                    <path d="M10 4H5v16h5M8 12h11M15 8l4 4-4 4" />
                  </svg>
                </span>
                参加
              </button>
            </div>
          </div>
          {groups.length > 1 && <p className="group-order-hint">長押しドラッグで表示順を変更</p>}
          <div className="group-card-list" id="groupCardList" ref={cardsRef}>
            {groups.map((item) => (
              <SortableGroupCard
                key={item.id}
                group={item}
                data={groupActivity.get(item.id) ?? null}
                error={today.error ?? ""}
                groups={groups}
                onOpen={() => {
                  onSelect(item.id);
                  setDetailTab("latest");
                  change("detail", item.id);
                }}
                onOrder={onOrder}
                list={cardsRef}
              />
            ))}
          </div>
          <ResourceError resource={today} />
          {!groups.length && (
            <div className="panel empty-community">
              <h2>グループはありません</h2>
              <p>作成するか、招待から参加できます。</p>
            </div>
          )}
        </>
      )}

      {mode === "detail" && (
        <>
          <button type="button" className="text-button back-button" onClick={detailBack}>
            ‹ グループ一覧
          </button>
          <ResourceError resource={detail} />
          {group ? (
            <>
              <GroupCard
                group={group}
                data={groupActivity.get(group.id) ?? null}
                error={today.error ?? ""}
                dragging={false}
                onClick={() => setDetailTab("latest")}
              />
              <div className="group-detail-actions">
                <button
                  type="button"
                  className="group-action-pill"
                  onClick={() => change("invite")}
                >
                  ＋ 招待
                </button>
              </div>
              <nav className="analytics-tabs group-detail-tabs" aria-label="グループの表示">
                {(["latest", "calendar", "graph", "settings"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={detailTab === tab}
                    onClick={() => {
                      setDetailTab(tab);
                      setEditingName(false);
                    }}
                  >
                    {
                      {
                        latest: "最新記録",
                        calendar: "カレンダー",
                        graph: "グラフ",
                        settings: "設定",
                      }[tab]
                    }
                  </button>
                ))}
              </nav>
              {detailTab === "latest" && (
                <>
                  <div className="group-detail-members-summary">
                    <button
                      type="button"
                      className="member-avatars-strip"
                      onClick={() => setDetailTab("settings")}
                      aria-label="メンバー管理を開く"
                    >
                      {group.members.slice(0, 5).map((member) => (
                        <Avatar
                          key={member.id}
                          userId={member.id}
                          name={member.display_name}
                          version={member.avatar_version}
                          small
                        />
                      ))}
                      <span>{group.members.length}人</span>
                    </button>
                  </div>
                  <ResourceError resource={activity} />
                  {activity.data && (
                    <Feed data={activity.data} active={active} trusted={!activity.refreshing} />
                  )}
                  {!activity.data && !activity.error && (
                    <LoadingState label="グループの記録を読み込み中" />
                  )}
                </>
              )}
              <div key={`calendar:${userId}:${selected}`} hidden={detailTab !== "calendar"}>
                <GroupHistoryCalendar
                  key={selected}
                  groupId={selected}
                  userId={userId}
                  active={active && detailTab === "calendar"}
                  refreshKey={refreshKey}
                  part={historyPart}
                  onPartChange={setHistoryPart}
                />
              </div>
              <div key={`graph:${userId}:${selected}`} hidden={detailTab !== "graph"}>
                <GroupHistoryGraph
                  groupId={selected}
                  active={active && detailTab === "graph"}
                  refreshKey={refreshKey}
                  part={historyPart}
                  onPartChange={setHistoryPart}
                />
              </div>
              {detailTab === "settings" && (
                <div className="group-settings">
                  <section>
                    <h2>グループ情報</h2>
                    <div className="group-settings-card">
                      <div className={`group-setting-row${editingName ? " is-editing" : ""}`}>
                        <b>グループ名</b>
                        {isOwner && editingName ? (
                          <GroupNameForm
                            key={group.id}
                            group={group}
                            inline
                            onCancel={() => setEditingName(false)}
                            onSaved={() => {
                              setEditingName(false);
                              onChanged();
                            }}
                          />
                        ) : isOwner ? (
                          <button
                            type="button"
                            className="text-button group-name-edit-trigger"
                            aria-label="グループ名を編集"
                            onClick={() => setEditingName(true)}
                          >
                            {group.name}
                          </button>
                        ) : (
                          <span>{group.name}</span>
                        )}
                      </div>
                    </div>
                  </section>
                  <section>
                    <div className="section-heading">
                      <h2>メンバー管理</h2>
                      <span className="muted">最近トレーニング順 · {group.members.length}人</span>
                    </div>
                    <div
                      className={`group-members-card${memberExpanded ? " expanded" : " collapsed"}`}
                    >
                      <div className="group-members-list">
                        {sortedMembers.map((member) => (
                          <div className="group-member-row" key={member.id}>
                            <Avatar
                              userId={member.id}
                              name={member.display_name}
                              version={member.avatar_version}
                            />
                            <div className="group-member-details">
                              <b>{member.display_name}</b>
                              <small>
                                {member.id === group.owner_id
                                  ? "オーナー"
                                  : member.id === userId
                                    ? "あなた · メンバー"
                                    : "メンバー"}
                                　{formatMemberActivity(member.last_activity_at)}
                              </small>
                            </div>
                            {member.id === group.owner_id ? (
                              <span className="group-owner-badge">オーナー</span>
                            ) : isOwner ? (
                              <button
                                type="button"
                                className="text-button"
                                aria-label={`${member.display_name}の設定`}
                                onClick={() => setActionSheet({ type: "transfer", member })}
                              >
                                •••
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      {group.members.length > 3 && (
                        <button
                          type="button"
                          className="group-members-fade"
                          aria-label={
                            memberExpanded ? "メンバー一覧を閉じる" : "メンバー一覧を展開"
                          }
                          onClick={() => setMemberExpanded((value) => !value)}
                        />
                      )}
                    </div>
                  </section>
                  <section className="group-danger-actions">
                    <button
                      type="button"
                      className="danger full"
                      onClick={() => setActionSheet({ type: "leave" })}
                    >
                      グループから抜ける
                    </button>
                    {isOwner && (
                      <button
                        type="button"
                        className="danger full"
                        onClick={() => setActionSheet({ type: "delete" })}
                      >
                        グループを削除
                      </button>
                    )}
                  </section>
                </div>
              )}
            </>
          ) : !detail.error ? (
            <LoadingState label="グループ情報を読み込み中" />
          ) : null}
        </>
      )}

      {mode === "create" && (
        <Sheet
          title={createdGroup ? "メンバーを招待" : "グループを作成"}
          dismissOnBackdrop={!!createdGroup}
          onClose={() => {
            setCreatedGroup(null);
            change("list");
          }}
        >
          <div className="group-create-sheet-body">
            {createdGroup ? (
              <InviteContents
                group={createdGroup}
                onDone={() => {
                  setCreatedGroup(null);
                  change("detail", createdGroup.id);
                }}
              />
            ) : (
              <form onSubmit={(event) => void createGroup(event)}>
                <label className="group-create-field">
                  グループ名
                  <input
                    value={groupName}
                    maxLength={40}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="例：いつものトレ仲間"
                  />
                </label>
                <button type="submit" className="primary full" disabled={busy}>
                  作成する
                </button>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
              </form>
            )}
          </div>
        </Sheet>
      )}

      {mode === "join" && (
        <>
          <button type="button" className="text-button back-button" onClick={leaveJoin}>
            ‹ グループ一覧
          </button>
          {invitePreview ? (
            <div className="group-join-detail">
              <section className="group-join-hero" aria-label="招待されたグループ">
                <span className="group-join-eyebrow">INVITE</span>
                <h1>{invitePreview.name}</h1>
                <div className="group-join-people">
                  <div className="group-card-avatars">
                    {invitePreview.members.slice(0, 4).map((member) => (
                      <Avatar key={member.id} userId={member.id} name={member.display_name} small />
                    ))}
                  </div>
                  <span>メンバー {invitePreview.member_count}人</span>
                </div>
              </section>
              <section>
                <div className="section-heading group-join-members-heading">
                  <h2>メンバー</h2>
                  <span className="muted">{invitePreview.member_count}人</span>
                </div>
                <div
                  className={`group-members-card${inviteMembersExpanded ? " expanded" : " collapsed"}`}
                >
                  <div className="group-members-list">
                    {invitePreview.members.map((member) => (
                      <div className="group-member-row" key={member.id}>
                        <Avatar userId={member.id} name={member.display_name} />
                        <div className="group-member-details">
                          <b>{member.display_name}</b>
                          <small>{member.role === "owner" ? "オーナー" : "メンバー"}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                  {invitePreview.members.length > 3 && (
                    <button
                      type="button"
                      className="group-members-fade"
                      aria-label={
                        inviteMembersExpanded ? "メンバー一覧を閉じる" : "メンバー一覧を展開"
                      }
                      onClick={() => setInviteMembersExpanded((value) => !value)}
                    />
                  )}
                </div>
              </section>
              <div className="group-join-footer">
                <button
                  type="button"
                  className="primary full"
                  disabled={inviteBusy}
                  onClick={() => void joinFromToken(inviteToken)}
                >
                  このグループに参加
                </button>
                <p>参加後の記録から共有されます</p>
              </div>
            </div>
          ) : (
            !inviteBusy && (
              <>
                <h1>グループに参加</h1>
                <p className="muted">
                  招待リンクを開くか、スマートフォンのカメラでQRコードを読み取ってください。
                </p>
                <form className="group-join-form" onSubmit={submitInviteLink}>
                  <label>
                    招待リンク
                    <input
                      type="url"
                      value={inviteValue}
                      onChange={(event) => setInviteValue(event.target.value)}
                      placeholder="招待リンクを貼り付け"
                    />
                  </label>
                  <button type="submit" className="group-action-pill">
                    リンクを確認
                  </button>
                </form>
              </>
            )
          )}
          {inviteError && (
            <p className="error" role="alert">
              {inviteError}
            </p>
          )}
        </>
      )}

      {mode === "invite" && group && (
        <>
          <button type="button" className="text-button back-button" onClick={detailBack}>
            ‹ {group.name}
          </button>
          <h1>メンバーを招待</h1>
          <InviteContents group={group} onDone={() => change("detail")} />
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {actionSheet?.type === "leave" && group && (
        <Sheet title="グループから抜ける" onClose={() => setActionSheet(null)}>
          {isOwner ? (
            group.members.length > 1 ? (
              <>
                <p>
                  オーナーがグループを抜けるには、先に別のメンバーへオーナー権限を移譲してください。
                </p>
                <button
                  type="button"
                  className="primary full"
                  onClick={() => {
                    setActionSheet(null);
                    setDetailTab("settings");
                    setMemberExpanded(true);
                    document
                      .querySelector(".group-settings")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  メンバー一覧へ
                </button>
              </>
            ) : (
              <>
                <p>
                  このグループには他のメンバーがいません。退出するにはグループを削除してください。
                </p>
                <button
                  type="button"
                  className="danger full"
                  onClick={() => setActionSheet({ type: "delete" })}
                >
                  グループを削除
                </button>
              </>
            )
          ) : (
            <>
              <p>「{group.name}」から抜けますか？</p>
              <div className="group-confirm-actions">
                <button type="button" className="secondary" onClick={() => setActionSheet(null)}>
                  キャンセル
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => void leaveGroup()}
                >
                  抜ける
                </button>
              </div>
            </>
          )}
        </Sheet>
      )}
      {actionSheet?.type === "transfer" && group && (
        <Sheet title={actionSheet.member.display_name} onClose={() => setActionSheet(null)}>
          <div className="group-sheet-actions">
            <button
              type="button"
              className="secondary full"
              disabled={busy}
              onClick={() => void executeOwnerTransfer(actionSheet.member)}
            >
              オーナーにする
            </button>
            <button
              type="button"
              className="danger full"
              disabled={busy}
              onClick={() => setActionSheet({ type: "remove", member: actionSheet.member })}
            >
              退出させる
            </button>
          </div>
        </Sheet>
      )}
      {actionSheet?.type === "remove" && group && (
        <Sheet title="メンバーを退出させる" onClose={() => setActionSheet(null)}>
          <p>
            「{actionSheet.member.display_name}」を「{group.name}」から退出させますか？
          </p>
          <div className="group-confirm-actions">
            <button type="button" className="secondary" onClick={() => setActionSheet(null)}>
              キャンセル
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => void executeRemoveMember(actionSheet.member)}
            >
              退出させる
            </button>
          </div>
        </Sheet>
      )}
      {actionSheet?.type === "delete" && group && (
        <Sheet title="グループを削除" onClose={() => setActionSheet(null)}>
          <p>「{group.name}」を削除しますか？</p>
          <div className="group-confirm-actions">
            <button type="button" className="secondary" onClick={() => setActionSheet(null)}>
              キャンセル
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => void deleteGroup()}
            >
              削除する
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function copyInviteLink(link: string) {
  const input = document.createElement("textarea");
  input.value = link;
  input.readOnly = true;
  input.style.position = "fixed";
  input.style.opacity = "0";
  (document.querySelector("dialog[open]") ?? document.body).append(input);
  input.focus();
  input.select();
  input.setSelectionRange(0, input.value.length);
  try {
    return document.execCommand("copy");
  } finally {
    input.remove();
  }
}

function InviteContents({ group, onDone }: { group: Group; onDone: () => void }) {
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const issued = useRef<{
    groupId: string;
    generation: number;
    request: Promise<InviteResponse>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (generation > 0) setError("");
    if (issued.current?.groupId !== group.id || issued.current.generation !== generation)
      issued.current = {
        groupId: group.id,
        generation,
        request: api<InviteResponse>(`/groups/${group.id}/invites`, { method: "POST" }),
      };
    issued.current.request
      .then(async (created) => {
        const url = new URL("/", window.location.origin);
        url.searchParams.set("groupInvite", created.token);
        const image = await QRCode.toDataURL(url.toString(), {
          width: 232,
          margin: 3,
          errorCorrectionLevel: "H",
        });
        if (!cancelled) {
          setInvite(created);
          setQr(image);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "招待を作成できませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, [group.id, generation]);

  const link =
    invite && typeof window !== "undefined"
      ? `${window.location.origin}/?groupInvite=${encodeURIComponent(invite.token)}`
      : "";
  async function share() {
    if (!link) return;
    setCopied(false);
    setManualCopy(false);
    try {
      if (navigator.share) {
        await navigator.share({ title: group.name, url: link });
        return;
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        return;
      }
    } catch {
      // HTTPの実機確認など、Clipboard APIが使えない場合は旧式のコピーへ進む。
    }
    try {
      if (copyInviteLink(link)) {
        setCopied(true);
        return;
      }
    } catch {
      // OSやブラウザがコピーを禁止した場合は、選択できるリンクを表示する。
    }
    setManualCopy(true);
  }

  return (
    <div className="group-invite-content">
      <div className="group-invite-pass">
        <div className="group-invite-pass-head">
          <span>E-GOTORE</span>
          <span>INVITE</span>
        </div>
        <p className="group-invite-name">{group.name}</p>
        <div className="group-invite-qr-stage">
          {qr ? (
            <>
              <img className="group-invite-qr" src={qr} alt={`${group.name}への招待QRコード`} />
              <span className="group-invite-qr-brand">
                <WombatBarbell />
              </span>
            </>
          ) : (
            <div className="group-invite-qr-placeholder" aria-label="QRコードを準備中" />
          )}
        </div>
        {invite && (
          <p className="group-invite-expiry">
            {new Date(invite.expires_at).toLocaleDateString("ja-JP", {
              timeZone: "Asia/Tokyo",
              month: "numeric",
              day: "numeric",
            })}
            まで
          </p>
        )}
      </div>
      <button
        type="button"
        className="primary full"
        disabled={!invite}
        onClick={() => void share()}
      >
        リンクを共有
      </button>
      {copied && <output className="group-copy-status">リンクをコピーしました</output>}
      {manualCopy && (
        <div className="group-invite-manual-copy">
          <label htmlFor="group-invite-link">リンクを長押ししてコピー</label>
          <input
            id="group-invite-link"
            value={link}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setError("");
              setInvite(null);
              setQr("");
              setGeneration((value) => value + 1);
            }}
          >
            再発行
          </button>
        </p>
      )}
      <button type="button" className="text-button full" onClick={onDone}>
        完了
      </button>
    </div>
  );
}

function SortableGroupCard({
  group,
  data,
  error,
  groups,
  onOpen,
  onOrder,
  list,
}: {
  group: Group;
  data: TodayGroupActivity | null;
  error: string;
  groups: Group[];
  onOpen: () => void;
  onOrder: (ids: string[]) => void;
  list: RefObject<HTMLDivElement | null>;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{
    x: number;
    y: number;
    pointerId: number;
    node: HTMLButtonElement;
  } | null>(null);
  const dragging = useRef(false);
  const suppress = useRef(false);
  const [moving, setMoving] = useState(false);
  const activeDrag = useRef<{
    items: HTMLElement[];
    centers: number[];
    from: number;
    to: number;
    startY: number;
    cardCenterY: number;
    step: number;
  } | null>(null);
  function stopTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }
  function clearDrag() {
    if (activeDrag.current)
      for (const item of activeDrag.current.items) {
        item.style.transform = "";
        item.classList.remove("is-shifting");
      }
    activeDrag.current = null;
    dragging.current = false;
    setMoving(false);
    stopTimer();
  }
  return (
    <div className={`group-list-drag-wrap${moving ? " is-dragging" : ""}`} data-group-id={group.id}>
      <GroupCard
        group={group}
        data={data}
        error={error}
        dragging={moving}
        ariaLabel={`${group.name}の詳細`}
        onClick={() => {
          if (suppress.current) {
            suppress.current = false;
            return;
          }
          onOpen();
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          start.current = {
            x: event.clientX,
            y: event.clientY,
            pointerId: event.pointerId,
            node: event.currentTarget,
          };
          timer.current = setTimeout(() => {
            if (!start.current) return;
            const items = Array.from(
              list.current?.querySelectorAll<HTMLElement>(".group-list-drag-wrap") ?? [],
            );
            const from = items.findIndex((item) => item.dataset.groupId === group.id);
            if (from < 0) return;
            const rects = items.map((item) => item.getBoundingClientRect());
            const gap = list.current
              ? Number.parseFloat(getComputedStyle(list.current).rowGap) || 0
              : 0;
            activeDrag.current = {
              items,
              centers: rects.map((rect) => rect.top + rect.height / 2),
              from,
              to: from,
              startY: start.current.y,
              cardCenterY: rects[from].top + rects[from].height / 2,
              step: rects[from].height + gap,
            };
            dragging.current = true;
            suppress.current = true;
            setMoving(true);
            try {
              start.current.node.setPointerCapture(start.current.pointerId);
            } catch {
              /* 既に解放済み */
            }
          }, 450);
        }}
        onPointerMove={(event) => {
          const pending = start.current;
          if (
            pending &&
            !dragging.current &&
            Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 12
          )
            stopTimer();
          const active = activeDrag.current;
          if (!active) return;
          event.preventDefault();
          const offset = event.clientY - active.startY;
          active.items[active.from].style.transform = `translate3d(0, ${offset}px, 0) scale(1.015)`;
          const center = active.cardCenterY + offset;
          const next = active.centers.filter(
            (position, index) => index !== active.from && center > position,
          ).length;
          if (next === active.to) return;
          active.to = next;
          for (const [index, item] of active.items.entries()) {
            if (index === active.from) continue;
            const shift =
              active.from < next && index > active.from && index <= next
                ? -active.step
                : active.from > next && index >= next && index < active.from
                  ? active.step
                  : 0;
            item.classList.toggle("is-shifting", shift !== 0);
            item.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : "";
          }
        }}
        onPointerUp={() => {
          const active = activeDrag.current;
          if (active) {
            const ids = active.items
              .map((item) => item.dataset.groupId)
              .filter((id): id is string => !!id);
            clearDrag();
            if (ids.length === groups.length && active.from !== active.to) {
              ids.splice(active.from, 1);
              ids.splice(active.to, 0, group.id);
              onOrder(ids);
            }
            window.setTimeout(() => {
              suppress.current = false;
            }, 0);
          } else stopTimer();
        }}
        onPointerCancel={() => {
          clearDrag();
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}

function formatMemberActivity(value?: string | null) {
  if (!value) return "記録なし";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "記録なし";
  const date = at.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });
  const time = at.toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
  const today = new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });
  return date === today ? `今日 ${time}` : date === yesterday ? `昨日 ${time}` : `${date} ${time}`;
}
