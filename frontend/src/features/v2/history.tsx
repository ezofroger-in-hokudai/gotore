import type { Workout } from "@/lib/api";
import { useState } from "react";
import { ActivityCalendar } from "../activity/activity-calendar";
import { dateLabel } from "../activity/calendar";
import { RecordList } from "../training/record-list";
import { useResource } from "../training/use-resource";

export function History({
  userId,
  active,
  refreshKey,
  onEdit,
  onReuse,
  onDeleted,
}: {
  userId: string;
  active: boolean;
  refreshKey: number;
  onEdit: (record: Workout) => void;
  onReuse: (record: Workout) => void;
  onDeleted: () => void;
}) {
  const [date, setDate] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const records = useResource<Workout[]>(
    `/workouts?offset=${page * 50}${date ? `&performed_on=${date}` : ""}`,
    refreshKey,
    false,
    true,
    { enabled: active },
  );
  const current = records.data?.find((record) => record.id === detail);
  if (current)
    return (
      <section className="history-detail">
        <button type="button" className="text-button back-button" onClick={() => setDetail(null)}>
          ‹ 履歴
        </button>
        <h1>{dateLabel(current.performed_on)}</h1>
        <p className="muted">
          {current.exercises.reduce((total, exercise) => total + exercise.sets.length, 0)}セット ·{" "}
          {current.started_at && current.ended_at
            ? `${Math.max(0, Math.floor((Date.parse(current.ended_at) - Date.parse(current.started_at)) / 60000))}分`
            : current.started_at
              ? "トレーニング中"
              : "時間未計測"}
        </p>
        <RecordList
          records={[current]}
          userId={userId}
          empty=""
          personal
          onEdit={onEdit}
          onReuse={onReuse}
          onDeleted={() => {
            setDetail(null);
            onDeleted();
          }}
        />
      </section>
    );
  return (
    <section className="history-screen">
      <h1>履歴</h1>
      <ActivityCalendar
        selectedDate={date}
        onSelect={(value) => {
          setDate(value);
          setPage(0);
        }}
        refreshKey={refreshKey}
        active={active}
      />
      <div className="section-heading">
        <h2>{date ? dateLabel(date) : "最近のトレーニング"}</h2>
        {date && (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setDate("");
              setPage(0);
            }}
          >
            すべての記録
          </button>
        )}
      </div>
      {records.error && (
        <p className="error" role="alert">
          {records.error}
          <button className="text-button" type="button" onClick={records.retry}>
            再試行
          </button>
        </p>
      )}
      <output className="resource-status muted">
        {records.loading ? (records.data ? "更新中…" : "読み込み中…") : ""}
      </output>
      <div className="v2-rows">
        {records.data?.map((record) => (
          <button
            className="v2-row history-row"
            type="button"
            key={record.id}
            onClick={() => setDetail(record.id)}
          >
            <div>
              <strong>
                {record.performed_on.replaceAll("-", "/")}
                {record.started_at && !record.ended_at ? " · トレーニング中" : ""}
              </strong>
              <p>{record.exercises.map((e) => e.name).join(" / ")}</p>
            </div>
            <span>{record.exercises.reduce((count, e) => count + e.sets.length, 0)} SETS ›</span>
          </button>
        ))}
      </div>
      {records.data?.length === 0 && (
        <p className="muted">{date ? "この日は記録なし" : "まだ記録がありません"}</p>
      )}
      {(page > 0 || records.data?.length === 50) && (
        <div className="pagination">
          <button
            type="button"
            className="secondary"
            disabled={!page || records.loading}
            onClick={() => setPage(page - 1)}
          >
            新しい記録
          </button>
          <span>{page + 1}ページ</span>
          <button
            type="button"
            className="secondary"
            disabled={records.data?.length !== 50 || records.loading}
            onClick={() => setPage(page + 1)}
          >
            以前の記録
          </button>
        </div>
      )}
    </section>
  );
}
