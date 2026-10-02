import type { MemoEntry } from "./memo-delivery";

export function memoNeedsReview(entry: MemoEntry) {
  return (
    entry.storageError ||
    (entry.errorStatus !== undefined && [400, 401, 403, 404, 409, 422].includes(entry.errorStatus))
  );
}

export function MemoFeedback({
  entry,
  label,
  onRetry,
  onReload,
  disabled = false,
}: {
  entry: MemoEntry;
  label?: string;
  onRetry: () => void;
  onReload?: () => void;
  disabled?: boolean;
}) {
  if (!entry.storageError && entry.phase !== "error") return null;
  const critical = memoNeedsReview(entry);
  const conflict = entry.errorStatus === 409;
  const message = entry.storageError
    ? label
      ? "メモを保持できません。開いて保存してください。"
      : "メモを保持できません。閉じずに保存してください。"
    : conflict
      ? label
        ? "別の変更があります。メモを開いて確認してください。"
        : "別の変更があります。"
      : entry.errorStatus === 401 || entry.errorStatus === 403
        ? "ログインし直してください。"
        : entry.errorStatus === 404
          ? "このメモは開けません。"
          : critical
            ? "メモを確認してください。"
            : "未送信";
  return (
    <p className={critical ? "error" : "memo-pending"} role={critical ? "alert" : "status"}>
      {label && <>{label}：</>}
      {message}
      {!conflict && (
        <button
          type="button"
          className="text-button"
          disabled={disabled || entry.phase === "sending"}
          onClick={onRetry}
        >
          再送
        </button>
      )}
      {onReload && critical && !entry.storageError && (
        <button
          type="button"
          className="text-button"
          disabled={disabled || entry.phase === "sending"}
          onClick={onReload}
        >
          読み直す
        </button>
      )}
    </p>
  );
}
