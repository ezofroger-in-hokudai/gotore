import type { Workout } from "@/lib/api";
import type { useResource } from "../training/use-resource";
import { PersonalHistory } from "./personal-history";

export function History({
  guideTarget,
  userId,
  recent,
  active,
  prefetch = false,
  refreshKey,
  onEdit,
  onReuse,
  onDeleted,
}: {
  guideTarget?: { target: string } | null;
  userId: string;
  recent: ReturnType<typeof useResource<Workout[]>>;
  active: boolean;
  prefetch?: boolean;
  refreshKey: number;
  onEdit: (record: Workout) => void;
  onReuse: (record: Workout) => void;
  onDeleted: () => void;
}) {
  return (
    <section className="history-screen">
      <PersonalHistory
        guideTarget={guideTarget}
        userId={userId}
        active={active}
        prefetch={prefetch}
        refreshKey={refreshKey}
        onEdit={onEdit}
        onReuse={onReuse}
        onDeleted={onDeleted}
      />
    </section>
  );
}
