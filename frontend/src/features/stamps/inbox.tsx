import { type Workout, api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { LoadingState } from "../loading/loading-state";
import { RecordList } from "../training/record-list";
import { useResource } from "../training/use-resource";
import { Sheet } from "../v2/sheet";
import { type StampList, inboxPath, stampKinds } from "./types";

export function StampInbox({
  groupId,
  workoutId,
  onClose,
}: { groupId?: string; workoutId?: string; onClose: () => void }) {
  const [offset, setOffset] = useState(0);
  const [recordId, setRecordId] = useState<{ id: string; group: string } | null>(null);
  const resource = useResource<StampList>(inboxPath(groupId, workoutId, offset), 0, 10000);
  const record = useResource<Workout>(
    recordId ? `/groups/${recordId.group}/workouts/${recordId.id}` : null,
  );
  const [seenError, setSeenError] = useState("");
  const [retry, setRetry] = useState(0);
  const acknowledged = useRef(new Set<string>());
  const data = resource.error ? null : resource.data;
  // 表示できたページの反応だけを既読にし、次ページや後着分を先取りしない。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 既読保存の再試行でも実行する。
  useEffect(() => {
    if (!data || recordId) return;
    const ids = data.items
      .filter((item) => !item.read && !acknowledged.current.has(item.id))
      .map((item) => item.id);
    if (!ids.length) return;
    let disposed = false;
    void api("/stamps/seen", { method: "POST", body: JSON.stringify({ ids, read: true }) })
      .then(() => {
        for (const id of ids) acknowledged.current.add(id);
        if (!disposed) setSeenError("");
      })
      .catch(() => {
        if (!disposed) setSeenError("既読にできませんでした");
      });
    return () => {
      disposed = true;
    };
  }, [data, recordId, retry]);
  return (
    <Sheet
      title={
        recordId ? "スタンプが届いた記録" : workoutId ? "今回届いたスタンプ" : "届いたスタンプ"
      }
      onClose={onClose}
    >
      {recordId ? (
        <>
          <button type="button" className="text-button" onClick={() => setRecordId(null)}>
            スタンプ一覧に戻る
          </button>
          {record.error ? (
            <p role="alert" className="error">
              {record.error}
              <button type="button" onClick={record.retry}>
                再試行
              </button>
            </p>
          ) : record.data ? (
            <RecordList records={[record.data]} empty="" />
          ) : (
            <LoadingState label="記録を読み込み中" />
          )}
        </>
      ) : (
        <>
          {resource.error && (
            <p role="alert" className="error">
              {resource.error}
              <button type="button" onClick={resource.retry}>
                再試行
              </button>
            </p>
          )}
          {!data && !resource.error && <LoadingState label="スタンプを読み込み中" />}
          {data && (
            <>
              <p className="muted">
                {data.people}人から {data.total}個
              </p>
              {!data.items.length && <p className="stamp-empty">まだスタンプはありません</p>}
              {data.items.map((item) => (
                <button
                  type="button"
                  className="stamp-inbox-row"
                  key={item.id}
                  onClick={() => setRecordId({ id: item.workout_id, group: item.group_id })}
                >
                  <span className="stamp-inbox-emoji">
                    {stampKinds.find((s) => s.id === item.kind)?.emoji}
                  </span>
                  <span>
                    <strong>{item.display_name}</strong>から
                    <br />
                    {stampKinds.find((s) => s.id === item.kind)?.label}
                    <small>
                      {item.group_name} · {item.performed_on}
                      <br />
                      {item.exercise}
                    </small>
                  </span>
                </button>
              ))}
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
            </>
          )}
          {seenError && (
            <p role="alert" className="error">
              {seenError}
              <button type="button" onClick={() => setRetry((value) => value + 1)}>
                再試行
              </button>
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}

export function StampInboxButton({ groupId }: { groupId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="text-button stamp-inbox-entry" onClick={() => setOpen(true)}>
        届いたスタンプ
      </button>
      {open && <StampInbox groupId={groupId} onClose={() => setOpen(false)} />}
    </>
  );
}
