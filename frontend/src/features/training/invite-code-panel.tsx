import { type Group, api } from "@/lib/api";
import { useEffect, useState } from "react";

export function InviteCodePanel({
  group,
  owner,
  onRenewed,
}: { group: Group; owner: boolean; onRenewed: (group: Group) => void }) {
  const [code, setCode] = useState(group.invite_code);
  const [expected, setExpected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => setCode(group.invite_code), [group.invite_code]);

  async function renew() {
    if (busy || !expected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await api<Group>(`/groups/${group.id}/invite-code`, {
        method: "POST",
        body: JSON.stringify({ expected_invite_code: expected }),
      });
      setCode(updated.invite_code);
      setExpected(null);
      setMessage("再発行しました。");
      onRenewed(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "再発行できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    setBusy(true);
    setError("");
    try {
      const current = await api<Group>(`/groups/${group.id}`);
      setCode(current.invite_code);
      setExpected(null);
      setMessage("取得しました。");
      onRenewed(current);
    } catch {
      setError("現在のコードを確認できませんでした。時間をおいて再試行してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="invite">
        <code data-testid="invite-code">{code}</code>
        <button
          type="button"
          className="secondary"
          disabled={busy || !!error}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setMessage("コピーしました。");
            } catch {
              setMessage("招待コードを選択してコピーしてください。");
            }
          }}
        >
          コピー
        </button>
      </div>
      {owner &&
        (expected ? (
          <div className="invite-confirm">
            <h3>再発行しますか？</h3>
            <p>古いコードは無効になります。</p>
            <div className="invite-actions">
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setExpected(null);
                }}
              >
                キャンセル
              </button>
              <button
                className="primary"
                type="button"
                disabled={busy || !!error}
                onClick={() => void renew()}
              >
                {busy ? "確認中…" : "再発行する"}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="text-button"
            type="button"
            disabled={busy || !!error}
            onClick={() => {
              setExpected(code);
              setMessage("");
            }}
          >
            再発行
          </button>
        ))}
      {error && (
        <div className="error" role="alert">
          {error} 再取得してください。
          <button
            className="secondary full"
            type="button"
            disabled={busy}
            onClick={() => void reload()}
          >
            再取得
          </button>
        </div>
      )}
      {message && <output className="notice">{message}</output>}
    </div>
  );
}
