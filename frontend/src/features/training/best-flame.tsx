import type { RecordBestSet } from "@/lib/api";

export function BestFlame({ best }: { best?: Pick<RecordBestSet, "weight" | "rm"> }) {
  const label =
    [best?.weight ? "自己最高重量" : "", best?.rm ? "自己最高RM" : ""].filter(Boolean).join("・") ||
    "最高記録";
  return (
    <span className="best-flame" role="img" aria-label={label} title={label}>
      🔥
    </span>
  );
}
