import type { Group } from "@/lib/api";
import { useRef, useState } from "react";
import { moveGroup, orderedGroups } from "./group-order";
import { Sheet } from "./sheet";

export function GroupOrderSheet({
  groups,
  onSave,
  onClose,
  available,
}: {
  groups: Group[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
  available: boolean;
}) {
  const [order, setOrder] = useState(() => groups.map((group) => group.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rows = useRef<HTMLOListElement>(null);
  const current = orderedGroups(groups, order);
  function move(id: string, index: number) {
    setOrder(
      moveGroup(
        current.map((group) => group.id),
        id,
        index,
      ),
    );
  }
  return (
    <Sheet title="グループの並べ替え" onClose={onClose}>
      <p className="muted">上からホームの左側に表示。この端末に保存します。</p>
      <ol className="group-order-list" ref={rows}>
        {current.map((group, index) => (
          <li key={group.id} className={dragging === group.id ? "is-dragging" : ""}>
            <button
              type="button"
              className="group-order-handle"
              aria-label={`${group.name}を移動`}
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(group.id);
              }}
              onPointerMove={(event) => {
                if (dragging !== group.id || !rows.current) return;
                const children = Array.from(rows.current.children);
                const target = children.findIndex((row) => {
                  const rect = row.getBoundingClientRect();
                  return event.clientY >= rect.top && event.clientY < rect.bottom;
                });
                if (target >= 0 && target !== index) move(group.id, target);
                const bounds = rows.current.getBoundingClientRect();
                if (event.clientY < bounds.top + 36) rows.current.scrollTop -= 16;
                if (event.clientY > bounds.bottom - 36) rows.current.scrollTop += 16;
              }}
              onPointerUp={() => setDragging(null)}
              onPointerCancel={() => setDragging(null)}
              onLostPointerCapture={() => setDragging(null)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  move(group.id, index + (event.key === "ArrowUp" ? -1 : 1));
                }
              }}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <span className="group-order-name">{group.name}</span>
            <button
              type="button"
              className="group-order-step"
              aria-label={`${group.name}を上へ`}
              disabled={index === 0}
              onClick={() => move(group.id, index - 1)}
            >
              ▴
            </button>
            <button
              type="button"
              className="group-order-step"
              aria-label={`${group.name}を下へ`}
              disabled={index === current.length - 1}
              onClick={() => move(group.id, index + 1)}
            >
              ▾
            </button>
          </li>
        ))}
      </ol>
      <output className="sr-only">{current.map((group) => group.name).join("、")}</output>
      {!available && (
        <p className="error" role="alert">
          グループを確認できません。閉じて再取得してください。
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="primary full"
        disabled={!available}
        onClick={() => {
          try {
            onSave(current.map((group) => group.id));
            onClose();
          } catch {
            setError("表示順を端末に保存できませんでした。もう一度お試しください。");
          }
        }}
      >
        完了
      </button>
    </Sheet>
  );
}
