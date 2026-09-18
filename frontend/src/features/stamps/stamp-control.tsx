import { useState } from "react";
import { LoadingState } from "../loading/loading-state";
import { useResource } from "../training/use-resource";
import { Sheet } from "../v2/sheet";
import { useStamps } from "./stamp-provider";
import { type StampKind, type StampList, stampChoices, stampKinds } from "./types";

export function StampControl({
  groupId,
  workoutId,
  name,
  active = true,
}: {
  groupId: string;
  workoutId: string;
  name: string;
  active?: boolean;
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
  function send(kind: StampKind) {
    if (store.toggle(groupId, workoutId, kind, name)) setOpen(null);
  }
  function reaction(kind: (typeof stampKinds)[number], picker = false) {
    const selected = data?.mine.includes(kind.id) ?? false;
    const pending = jobs.some((job) => job.kind === kind.id && job.state === "pending");
    return (
      <button
        key={kind.id}
        type="button"
        className={picker ? "inline-stamp-choice" : "inline-stamp-touch"}
        aria-label={`${kind.label}${picker ? "" : ` ${data?.counts[kind.id] ?? 0}件`}`}
        aria-pressed={selected}
        disabled={!data?.can_send || jobs.some((job) => job.kind === kind.id)}
        onClick={() => send(kind.id)}
      >
        <span className="inline-stamp-pill">
          <span aria-hidden="true">{kind.emoji}</span>
          {!picker && <span>{data?.counts[kind.id] ?? 0}</span>}
          {pending ? (
            <span className="loading-spinner" role="status" aria-label="スタンプを送信中" />
          ) : (
            selected && (
              <span className="inline-stamp-check" aria-hidden="true">
                ✓
              </span>
            )
          )}
        </span>
      </button>
    );
  }
  return (
    <div className="inline-stamps" aria-label={`${name}の記録のスタンプ`}>
      <div className="inline-stamp-row">
        {data &&
          stampKinds
            .filter(
              (kind) =>
                (data.counts[kind.id] ?? 0) > 0 ||
                jobs.some((job) => job.kind === kind.id && job.state === "pending"),
            )
            .map((kind) => reaction(kind))}
        {data?.can_send && (
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
          title={open === "picker" ? "スタンプ" : "リアクション"}
          onClose={() => setOpen(null)}
        >
          <p className="stamp-target">
            <strong>{name}の記録</strong>
          </p>
          {open === "picker" ? (
            <div className="inline-stamp-picker">
              {stampChoices.map((kind) => reaction(kind, true))}
            </div>
          ) : (
            <>
              {resource.error && (
                <p className="error" role="alert">
                  {resource.error}
                  <button type="button" className="secondary" onClick={resource.retry}>
                    再試行
                  </button>
                </p>
              )}
              {!people && !resource.error && <LoadingState label="リアクションを読み込み中" />}
              {people?.items.map((item) => (
                <div className="stamp-person" key={item.id}>
                  <span>
                    {item.display_name}
                    {item.mine && "（あなた）"}
                  </span>
                  <span aria-label={stampKinds.find((kind) => kind.id === item.kind)?.label}>
                    {stampKinds.find((kind) => kind.id === item.kind)?.emoji}
                  </span>
                </div>
              ))}
              {people && !people.items.length && <p className="muted">まだスタンプはありません</p>}
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
