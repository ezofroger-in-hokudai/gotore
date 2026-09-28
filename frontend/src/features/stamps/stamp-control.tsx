import { useEffect, useState } from "react";
import { LoadingState } from "../loading/loading-state";
import { useResource } from "../training/use-resource";
import { Avatar } from "../v2/avatar";
import { Sheet } from "../v2/sheet";
import { useStamps } from "./stamp-provider";
import { type StampKind, type StampList, stampChoices, stampKinds } from "./types";

export function StampControl({
  groupId,
  workoutId,
  name,
  active = true,
  direct = false,
  disabled = false,
}: {
  groupId: string;
  workoutId: string;
  name: string;
  active?: boolean;
  direct?: boolean;
  disabled?: boolean;
}) {
  const store = useStamps(groupId, workoutId, active);
  const data = store.view(groupId, workoutId);
  const jobs = store.forRecord(groupId, workoutId);
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const resource = useResource<StampList>(
    `/groups/${groupId}/workouts/${workoutId}/stamps?offset=${offset}`,
    0,
    10000,
    false,
    { enabled: active && open },
  );
  const people = resource.error ? null : resource.data;
  const detailRows = people
    ? stampKinds
        .map((kind) => ({ kind, items: people.items.filter((item) => item.kind === kind.id) }))
        .filter((row) => row.items.length)
    : [];
  useEffect(
    () => () => {
      // 詳細・記録画面を閉じても、選択済みの反応は画面外で送信を続ける。
      store.flush(groupId, workoutId);
    },
    [groupId, store, workoutId],
  );
  function send(kind: StampKind) {
    const failed = jobs.find((job) => job.kind === kind && job.state === "failed");
    if (failed) {
      store.retry(failed.id);
      return;
    }
    store.toggle(groupId, workoutId, kind, name, direct);
  }
  function reaction(kind: (typeof stampChoices)[number]) {
    const selected = data?.mine.includes(kind.id);
    return (
      <button
        key={kind.id}
        type="button"
        className="inline-stamp-choice"
        aria-label={`${kind.emoji}スタンプ`}
        aria-pressed={selected}
        disabled={
          disabled ||
          !data?.can_send ||
          jobs.some((job) => job.kind === kind.id && job.state === "pending")
        }
        onClick={() => send(kind.id)}
      >
        <span className="inline-stamp-pill">
          <span aria-hidden="true">{kind.emoji}</span>
          {selected && (
            <span className="inline-stamp-check" aria-hidden="true">
              ✓
            </span>
          )}
        </span>
      </button>
    );
  }
  return (
    <div className="inline-stamps" aria-label={`${name}の記録のスタンプ`}>
      <div className="inline-stamp-row">
        {stampChoices.map(reaction)}
        <button
          type="button"
          className="inline-stamp-touch"
          aria-label={`${name}のリアクションの詳細`}
          disabled={disabled || !data}
          onClick={() => {
            setOffset(0);
            setOpen(true);
          }}
        >
          <span className="inline-stamp-more">…</span>
        </button>
      </div>
      {active && open && (
        <Sheet title="スタンプ" onClose={() => setOpen(false)}>
          <>
            <div className="stamp-detail-target">
              <strong>
                {people?.target
                  ? `${people.target.performed_on.replaceAll("-", ".")}の記録`
                  : `${name}の記録`}
              </strong>
            </div>
            {resource.error && (
              <p className="error" role="alert">
                {resource.error}
                <button type="button" className="secondary" onClick={resource.retry}>
                  再試行
                </button>
              </p>
            )}
            {!people && !resource.error && <LoadingState label="リアクションを読み込み中" />}
            {detailRows.map(({ kind, items }) => (
              <section
                className="stamp-reaction-row"
                key={kind.id}
                aria-label={`${kind.emoji}スタンプ ${items
                  .map((item) => item.display_name)
                  .join("、")}`}
              >
                <span className="stamp-reaction-emoji" aria-hidden="true">
                  {kind.emoji}
                </span>
                <div className="stamp-avatar-stack">
                  {items.map((item) => (
                    <Avatar
                      key={item.id}
                      userId={item.sender_id}
                      name={item.display_name}
                      version={item.avatar_version}
                      small
                    />
                  ))}
                </div>
              </section>
            ))}
            {people && !detailRows.length && <p className="muted">まだスタンプはありません</p>}
            <div className="stamp-pages">
              {offset > 0 && (
                <button type="button" className="secondary" onClick={() => setOffset(offset - 50)}>
                  前の50件
                </button>
              )}
              {people?.has_more && (
                <button type="button" className="secondary" onClick={() => setOffset(offset + 50)}>
                  次の50件
                </button>
              )}
            </div>
          </>
        </Sheet>
      )}
    </div>
  );
}
