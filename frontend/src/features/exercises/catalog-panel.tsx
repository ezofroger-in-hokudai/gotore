import { LoadingState } from "../loading/loading-state";
import { ResourceError } from "../training/resource-error";
import { ExerciseCatalog } from "./exercise-catalog";
import type { useExerciseCatalog } from "./use-exercise-catalog";

export function CatalogPanel({
  catalog,
  disabled = false,
  startAdding = false,
}: {
  catalog: ReturnType<typeof useExerciseCatalog>;
  disabled?: boolean;
  startAdding?: boolean;
}) {
  return (
    <>
      <ResourceError resource={catalog} />
      {catalog.data === null ? (
        !catalog.error && <LoadingState label="種目を読み込み中" />
      ) : (
        <ExerciseCatalog
          options={catalog.data}
          expanded
          disabled={disabled}
          onChanged={catalog.changed}
          startAdding={startAdding}
        />
      )}
    </>
  );
}
