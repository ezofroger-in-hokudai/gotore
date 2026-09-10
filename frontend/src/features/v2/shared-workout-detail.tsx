import type { Workout } from "@/lib/api";
import { RecordList } from "../training/record-list";
import { Sheet } from "./sheet";

export function SharedWorkoutDetail({
  record,
  onClose,
}: { record: { data: Workout | null; error: string; retry: () => void }; onClose: () => void }) {
  return (
    <Sheet title="記録の詳細" onClose={onClose}>
      {record.error ? (
        <p role="alert" className="error">
          {record.error}
          <button type="button" className="text-button" onClick={record.retry}>
            再試行
          </button>
        </p>
      ) : record.data ? (
        <RecordList records={[record.data]} empty="" expanded />
      ) : (
        <output className="muted">読み込み中…</output>
      )}
    </Sheet>
  );
}
