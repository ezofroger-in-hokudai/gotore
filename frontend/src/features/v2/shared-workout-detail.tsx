import type { Workout } from "@/lib/api";
import { dateLabel } from "../activity/calendar";
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
    <Sheet title={record.data ? dateLabel(record.data.performed_on) : "記録"} onClose={onClose}>
      {record.error ? (
        <p role="alert" className="error">
          {record.error}
          <button type="button" className="text-button" onClick={record.retry}>
            再試行
          </button>
        </p>
      ) : record.data ? (
        <>
          <RecordList
            records={[record.data]}
            empty=""
            showDate={false}
            headerControl={(workout) =>
              groupId ? (
                <StampControl
                  key={`${groupId}:${workout.id}`}
                  groupId={groupId}
                  workoutId={workout.id}
                  name={workout.display_name}
                />
              ) : null
            }
          />
        </>
      ) : (
        <LoadingState label="記録を読み込み中" />
      )}
    </Sheet>
  );
}
