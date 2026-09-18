import { LoadingState } from "../loading/loading-state";
import { type StampKind, type StampList, stampKinds } from "./types";

export function StampSummaryRow({
  data,
  newKinds = [],
  onOpen,
  onRetry,
  onRetryAcknowledgement,
  detailsLabel = "届いたスタンプの詳細",
}: {
  data: StampList | null;
  newKinds?: StampKind[];
  onOpen: () => void;
  onRetry?: () => void;
  onRetryAcknowledgement?: () => void;
  detailsLabel?: string;
}) {
  return (
    <div className="stamp-live-row">
      <div className="stamp-live-list" aria-label="届いたスタンプの種類と件数">
        {data &&
          stampKinds
            .filter((kind) => (data.counts?.[kind.id] ?? 0) > 0)
            .map((kind) => (
              <button
                type="button"
                key={kind.id}
                className={`inline-stamp-touch${newKinds.includes(kind.id) ? " stamp-live-new" : ""}`}
                aria-label={`${kind.label} ${data.counts?.[kind.id]}件の詳細`}
                onClick={onOpen}
              >
                <span className="inline-stamp-pill">
                  <span aria-hidden="true">{kind.emoji}</span>
                  <span>{data.counts?.[kind.id]}</span>
                </span>
              </button>
            ))}
        {data?.total === 0 && <span className="stamp-live-empty">スタンプなし</span>}
        {!data && !onRetry && <LoadingState compact label="届いたスタンプを読み込み中" />}
        {onRetry && (
          <button
            type="button"
            className="inline-stamp-touch stamp-live-error"
            aria-label="スタンプ取得を再試行"
            onClick={onRetry}
          >
            再試行
          </button>
        )}
        {onRetryAcknowledgement && (
          <button
            type="button"
            className="inline-stamp-touch stamp-live-error"
            aria-label="受信状態の保存を再試行"
            onClick={onRetryAcknowledgement}
          >
            再試行
          </button>
        )}
      </div>
      <button
        type="button"
        className="inline-stamp-touch stamp-live-details"
        aria-label={`${detailsLabel}${data?.unread ? `・未読${data.unread}件` : ""}`}
        onClick={onOpen}
      >
        <span className="inline-stamp-more" aria-hidden="true">
          …
        </span>
        {!!data?.unread && <span className="stamp-live-unread" aria-hidden="true" />}
      </button>
    </div>
  );
}
