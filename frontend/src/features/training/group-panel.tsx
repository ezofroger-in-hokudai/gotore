import { type Group, type GroupDetail, api } from "@/lib/api";
import { type FormEvent, useState } from "react";
import { GroupNameForm } from "./group-name-form";
import { InviteCodePanel } from "./invite-code-panel";

export function GroupPanel({
  groups,
  detail,
  onGroup,
  onSelect,
  userId,
}: {
  groups: Group[];
  detail: GroupDetail | null;
  onGroup: (group: Group) => void;
  onSelect: (id: string) => void;
  userId: string;
}) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get("value") ?? "").trim();
    if (!value) {
      setError("入力してください。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const group = await api<Group>(mode === "create" ? "/groups" : "/groups/join", {
        method: "POST",
        body: JSON.stringify(
          mode === "create" ? { name: value } : { invite_code: value.toUpperCase() },
        ),
      });
      onGroup(group);
      form.reset();
      setMessage(
        mode === "create"
          ? "グループを作成しました。招待コードを仲間に渡しましょう。"
          : "グループに参加しました。",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p className="eyebrow">YOUR TEAM</p>
      <h1>一緒に、続けよう。</h1>
      <p className="muted">グループを作って、いつもの仲間を招待。</p>
      {groups.length > 0 && (
        <div className="group-list">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`group-option ${detail?.id === group.id ? "active" : ""}`}
              onClick={() => onSelect(group.id)}
            >
              <span className="group-avatar">{group.name.slice(0, 1)}</span>
              <span>{group.name}</span>
              <span className="arrow">→</span>
            </button>
          ))}
        </div>
      )}
      {detail && (
        <div className="panel">
          <p className="eyebrow">INVITE YOUR FRIENDS</p>
          <h2>{detail.name}</h2>
          <p className="muted">このコードを知っている人が参加できます。</p>
          <InviteCodePanel
            key={`invite:${detail.id}`}
            group={detail}
            owner={detail.owner_id === userId}
            onRenewed={onGroup}
          />
          <h3>
            メンバー <span className="muted">{detail.members.length}人</span>
          </h3>
          <div className="members">
            {detail.members.map((member) => (
              <span className="member" key={member.id}>
                {member.display_name}
              </span>
            ))}
          </div>
          {detail.owner_id === userId && (
            <GroupNameForm
              key={detail.id}
              group={detail}
              onSaved={(group) => {
                onGroup(group);
                setMessage("グループ名を変更しました。");
              }}
            />
          )}
        </div>
      )}
      <div className="panel">
        <div className="segmented">
          <button
            type="button"
            disabled={busy}
            className={mode === "create" ? "selected" : ""}
            onClick={() => {
              setMode("create");
              setError("");
            }}
          >
            グループを作る
          </button>
          <button
            type="button"
            disabled={busy}
            className={mode === "join" ? "selected" : ""}
            onClick={() => {
              setMode("join");
              setError("");
            }}
          >
            招待コードで参加
          </button>
        </div>
        <form onSubmit={submit} key={mode}>
          <fieldset disabled={busy}>
            <label>
              {mode === "create" ? "グループ名" : "招待コード"}
              <input
                name="value"
                required
                maxLength={mode === "create" ? 40 : 12}
                minLength={mode === "create" ? 1 : 12}
                pattern={mode === "join" ? "[A-Fa-f0-9]{12}" : undefined}
                autoComplete="off"
                placeholder={mode === "create" ? "例：いつものトレ仲間" : "12桁の招待コード"}
              />
            </label>
            <button type="submit" className="primary">
              {busy
                ? "処理しています…"
                : mode === "create"
                  ? "グループを作成 →"
                  : "グループに参加 →"}
            </button>
          </fieldset>
        </form>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <output className="notice">{message}</output>}
    </section>
  );
}
