import type { Workout } from "@/lib/api";
import { LoadingState } from "../loading/loading-state";
import { StampControl } from "../stamps/stamp-control";
import { RecordList } from "../training/record-list";
import { Sheet } from "./sheet";

export function SharedWorkoutDetail({
  record,
  groupId,
  onClose,
}: {
  groupId?: string;
  record: { data: Workout | null; error: string; retry: () => void };
  onClose: () => void;
}) {
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
        <>
          {groupId && (
            <StampControl
              key={`${groupId}:${record.data.id}`}
              groupId={groupId}
              workoutId={record.data.id}
              name={record.data.display_name}
            />
          )}
          <RecordList records={[record.data]} empty="" />
        </>
      ) : (
        <LoadingState label="記録の詳細を読み込み中" />
      )}
    </Sheet>
  );
}
