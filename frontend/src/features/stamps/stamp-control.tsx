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
  alwaysVisible = false,
}: {
  groupId: string;
  workoutId: string;
  name: string;
  active?: boolean;
  direct?: boolean;
  alwaysVisible?: boolean;
}) {
  const store = useStamps(groupId, workoutId, active);
  const data = store.view(groupId, workoutId);
  const jobs = store.forRecord(groupId, workoutId);
  const [open, setOpen] = useState<"picker" | "details" | null>(null);
  const [offset, setOffset] = useState(0);
  const resource = useResource<StampList>(
    `/groups/${groupId}/workouts/${workoutId}/stamps?offset=${offset}`,
    0,
    10000,
    false,
    { enabled: active && open === "details" },
  );
  const people = resource.error ? null : resource.data;
  const error = store.get(groupId, workoutId).error;
  const detailRows = people
    ? stampKinds
        .map((kind) => ({ kind, items: people.items.filter((item) => item.kind === kind.id) }))
        .filter((row) => row.items.length)
    : [];
  useEffect(() => {
    // 表示された直後に取得を始め、スタンプの押下を待たせない。
    if (active && !data && !error) void store.refresh(groupId, [workoutId]);
  }, [active, data, error, groupId, store, workoutId]);
  useEffect(
    () => () => {
      // 詳細・記録画面を閉じても、選択済みの反応は画面外で送信を続ける。
      store.flush(groupId, workoutId);
    },
    [groupId, store, workoutId],
  );
  function send(kind: StampKind) {
    const defer = direct || open === "picker";
    if (store.toggle(groupId, workoutId, kind, name, defer) && !defer) setOpen(null);
  }
  function reaction(kind: (typeof stampKinds)[number], picker = false, neutral = false) {
    const selected = data?.mine.includes(kind.id) ?? false;
    return (
      <button
        key={kind.id}
        type="button"
        className={picker ? "inline-stamp-choice" : "inline-stamp-touch"}
        aria-label={
          neutral
            ? `${kind.emoji}スタンプ`
            : `${kind.label}${picker ? "" : ` ${data?.counts[kind.id] ?? 0}件`}`
        }
        aria-pressed={selected}
        disabled={!data?.can_send}
        onClick={() => send(kind.id)}
      >
        <span className="inline-stamp-pill">
          <span aria-hidden="true">{kind.emoji}</span>
          {!picker && <span>{data?.counts[kind.id] ?? 0}</span>}
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
        {(direct || alwaysVisible) && data
          ? stampChoices.map((kind) => reaction(kind, true, true))
          : data &&
            stampKinds
              .filter(
                (kind) =>
                  (data.counts[kind.id] ?? 0) > 0 ||
                  jobs.some((job) => job.kind === kind.id && job.state === "pending"),
              )
              .map((kind) => reaction(kind))}
        {data?.can_send && !direct && !alwaysVisible && (
          <button
            type="button"
            className="inline-stamp-touch"
            aria-label={`${name}の記録にスタンプを追加`}
            onClick={() => setOpen("picker")}
          >
            <span className="inline-stamp-pill inline-stamp-circle">＋</span>
          </button>
        )}
        {data && (
          <button
            type="button"
            className="inline-stamp-touch"
            aria-label={`${name}のリアクションの詳細`}
            onClick={() => {
              setOffset(0);
              setOpen("details");
            }}
          >
            <span className="inline-stamp-more">…</span>
          </button>
        )}
        {!data && !error && <LoadingState label="スタンプを読み込み中" />}
      </div>
      {error && (
        <p className="inline-stamp-error" role="alert">
          {error}
          <button
            type="button"
            className="secondary"
            onClick={() => void store.refresh(groupId, [workoutId])}
          >
            再試行
          </button>
        </p>
      )}
      {jobs
        .filter((job) => job.state === "failed")
        .map((job) => (
          <p className="inline-stamp-error" role="alert" key={job.id}>
            送れませんでした
            <button type="button" className="secondary" onClick={() => store.retry(job.id)}>
              再試行
            </button>
          </p>
        ))}
      {active && open && (
        <Sheet
          title="スタンプ"
          onClose={() => {
            if (open === "picker") store.flush(groupId, workoutId);
            setOpen(null);
          }}
        >
          {open === "picker" ? (
            <>
              <p className="stamp-target">
                <strong>{name}の記録</strong>
              </p>
              <div className="inline-stamp-picker">
                {stampChoices.map((kind) => reaction(kind, true, true))}
              </div>
            </>
          ) : (
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
                        small
                      />
                    ))}
                  </div>
                </section>
              ))}
              {people && !detailRows.length && <p className="muted">まだスタンプはありません</p>}
              <div className="stamp-pages">
                {offset > 0 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setOffset(offset - 50)}
                  >
                    前の50件
                  </button>
                )}
                {people?.has_more && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setOffset(offset + 50)}
                  >
                    次の50件
                  </button>
                )}
              </div>
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}
