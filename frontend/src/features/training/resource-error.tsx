export function ResourceError({
  resource,
  retryLabel = "再試行",
}: {
  resource: { data?: unknown; error?: string; retry: () => void };
  retryLabel?: string;
}) {
  if (!resource.error) return null;
  return (
    <p className="error" role="alert">
      {resource.data != null
        ? "更新できませんでした。前回の内容を表示しています。"
        : resource.error}
      <button type="button" className="text-button" onClick={resource.retry}>
        {retryLabel}
      </button>
    </p>
  );
}
