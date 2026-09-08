"use client";

import { type GroupDetail, api } from "@/lib/api";
import { useState } from "react";

type Member = GroupDetail["members"][number];
export function MembershipPanel({
  group,
  userId,
  onChanged,
}: {
  group: GroupDetail;
  userId: string;
  onChanged: (left: boolean) => void;
}) {
  const [target, setTarget] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const owner = group.owner_id === userId;
  const self = group.members.find((member) => member.id === userId);
  async function confirm() {
    if (!target || busy) return;
    const left = target.id === userId;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const suffix = left ? "membership" : `members/${target.id}`;
      await api(
        `/groups/${group.id}/${suffix}?${new URLSearchParams({ expected_joined_at: target.joined_at })}`,
        { method: "DELETE" },
      );
      setTarget(null);
      setNotice("メンバーを除外しました。本人の記録は保持されています。");
      onChanged(left);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="membership-list">
        {group.members.map((member) => (
          <div className="membership-row" key={member.id}>
            <span>
              {member.display_name}
              {member.id === group.owner_id ? "（オーナー）" : ""}
            </span>
            {owner && member.id !== userId && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                aria-label={`${member.display_name}を除外`}
                onClick={() => {
                  setTarget(member);
                  setError("");
                  setNotice("");
                }}
              >
                除外
              </button>
            )}
          </div>
        ))}
      </div>
      {owner ? (
        <p className="muted">オーナーはこのグループから退出できません。</p>
      ) : (
        self && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setTarget(self);
              setError("");
            }}
          >
            グループから退出
          </button>
        )
      )}
      {target && (
        <div className="membership-confirm">
          <p>
            「{group.name}」から{target.id === userId ? "退出" : `${target.display_name}さんを除外`}
            しますか？
          </p>
          <p>
            本人の履歴は残り、このグループへの過去の共有は解除されます。再参加しても以前の記録は自動共有されません。
          </p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setTarget(null)}
          >
            キャンセル
          </button>{" "}
          <button type="button" className="primary" disabled={busy} onClick={confirm}>
            {busy ? "処理しています…" : target.id === userId ? "退出する" : "除外する"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <output className="notice">{notice}</output>}
    </div>
  );
}
