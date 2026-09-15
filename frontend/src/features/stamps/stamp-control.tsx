import { api } from "@/lib/api";
import { useState } from "react";
import { LoadingState } from "../loading/loading-state";
import { useResource } from "../training/use-resource";
import { Sheet } from "../v2/sheet";
import { type StampKind, type StampList, stampKinds } from "./types";

export function StampControl({
  groupId,
  workoutId,
  name,
}: { groupId: string; workoutId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<StampKind>("clap");
  const [members, setMembers] = useState(false);
  const [filter, setFilter] = useState<StampKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState<{ kind: StampKind; remove: boolean } | null>(null);
  const path = `/groups/${groupId}/workouts/${workoutId}/stamps`;
  const resource = useResource<StampList>(`${path}?offset=${offset}`, 0, 10000, false, {
    enabled: open,
  });
  const data = resource.error ? null : resource.data;
  async function send(kind: StampKind, remove: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setAttempt({ kind, remove });
    try {
      await api(`${path}/${kind}`, { method: remove ? "DELETE" : "PUT" });
      const fresh = await api<StampList>(`${path}?offset=${offset}`);
      resource.updateData(() => fresh);
      setNotice(remove ? "取り消しました" : "送りました");
      setAttempt(null);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "送れませんでした");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stamp-control">
      <button
        type="button"
        className="stamp-open"
        onClick={() => {
          setOpen(true);
          setOffset(0);
          setMembers(false);
          setNotice("");
          setError("");
        }}
        aria-label={`${name}の記録のスタンプを開く`}
      >
        スタンプ{data ? ` · ${data.total}` : " ＋"}
      </button>
      {!open && notice && <output className="stamp-success">{notice}</output>}
      {open && (
        <Sheet
          title={members ? "スタンプを押した人" : "スタンプ"}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p className="stamp-target">
            <strong>{name}の記録</strong>
            {data?.target && (
              <small>
                {data.target.group_name} · {data.target.performed_on}
              </small>
            )}
          </p>
          {resource.error && (
            <p className="error" role="alert">
              {resource.error}
              <button type="button" onClick={resource.retry}>
                再試行
              </button>
            </p>
          )}
          {!data && !resource.error && <LoadingState label="スタンプを読み込み中" />}
          {data && (
            <>
              {!members && data.can_send && (
                <>
                  <div className="stamp-picker">
                    {stampKinds.map((stamp) => (
                      <button
                        key={stamp.id}
                        type="button"
                        disabled={busy}
                        aria-pressed={selected === stamp.id}
                        onClick={() => {
                          setSelected(stamp.id);
                          setNotice("");
                        }}
                      >
                        <span>{stamp.emoji}</span>
                        <strong>{stamp.label}</strong>
                        <small>{data.mine.includes(stamp.id) ? "送信済み ✓" : "　"}</small>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className="primary full"
                    onClick={() => void send(selected, data.mine.includes(selected))}
                  >
                    {busy ? (
                      <LoadingState label="スタンプを送信中" />
                    ) : data.mine.includes(selected) ? (
                      "選んだスタンプを取り消す"
                    ) : (
                      `${stampKinds.find((s) => s.id === selected)?.emoji} を送る`
                    )}
                  </button>
                </>
              )}
              <output className="stamp-success">{notice}</output>
              {error && (
                <p className="error" role="alert">
                  {error}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => attempt && void send(attempt.kind, attempt.remove)}
                  >
                    再試行
                  </button>
                </p>
              )}
              {!members ? (
                <button
                  type="button"
                  className="text-button full"
                  onClick={() => {
                    setMembers(true);
                    setFilter(null);
                  }}
                >
                  押した人を見る · {data.total}
                </button>
              ) : (
                <>
                  <div className="stamp-filters">
                    <button type="button" aria-pressed={!filter} onClick={() => setFilter(null)}>
                      すべて
                    </button>
                    {stampKinds.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        aria-label={s.label}
                        aria-pressed={filter === s.id}
                        onClick={() => setFilter(s.id)}
                      >
                        {s.emoji}
                      </button>
                    ))}
                  </div>
                  {data.items
                    .filter((item) => !filter || item.kind === filter)
                    .map((item) => (
                      <div className="stamp-person" key={item.id}>
                        <span>
                          {item.display_name}
                          {item.mine && "（あなた）"}
                        </span>
                        <span>{stampKinds.find((s) => s.id === item.kind)?.emoji}</span>
                      </div>
                    ))}
                  {!data.items.length && <p className="muted">まだスタンプはありません</p>}
                  <div className="stamp-pages">
                    {offset > 0 && (
                      <button type="button" onClick={() => setOffset(offset - 50)}>
                        前の50件
                      </button>
                    )}
                    {data.has_more && (
                      <button type="button" onClick={() => setOffset(offset + 50)}>
                        次の50件
                      </button>
                    )}
                  </div>
                  {data.can_send && (
                    <button
                      type="button"
                      className="text-button full"
                      onClick={() => {
                        setOffset(0);
                        setMembers(false);
                      }}
                    >
                      スタンプを選ぶ
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}
