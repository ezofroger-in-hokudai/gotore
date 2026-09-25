import type { ExerciseOption } from "@/lib/api";
import { useResource } from "../training/use-resource";

export type CatalogChange = { saved: ExerciseOption } | { deleted: string };

export function useExerciseCatalog(onChanged?: () => void, enabled = true) {
  const resource = useResource<ExerciseOption[]>("/exercise-options", 0, false, false, { enabled });
  return {
    ...resource,
    changed: (change?: CatalogChange) => {
      if (change) {
        resource.updateData((current) => {
          const options = current ?? [];
          if ("deleted" in change) return options.filter((option) => option.id !== change.deleted);
          return options.some((option) => option.id === change.saved.id)
            ? options.map((option) => (option.id === change.saved.id ? change.saved : option))
            : [...options, change.saved];
        });
        // 保存結果を先に全画面へ反映してから、背景で一覧を確認する。
        window.setTimeout(resource.retry, 0);
      } else resource.retry();
      if (change) onChanged?.();
    },
  };
}
