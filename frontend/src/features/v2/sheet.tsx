import { type PointerEvent, type ReactNode, useEffect, useId, useRef } from "react";

export function Sheet({
  title,
  onClose,
  children,
  showCloseButton = true,
  dismissOnBackdrop = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  showCloseButton?: boolean;
  dismissOnBackdrop?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPointer = useRef<number | null>(null);
  const swipe = useRef<{ pointerId: number; x: number; y: number; distance: number } | null>(null);
  const key = useId();
  const mounted = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  const outside = (event: PointerEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      event.target === event.currentTarget &&
      (event.clientX < bounds.left ||
        event.clientX >= bounds.right ||
        event.clientY < bounds.top ||
        event.clientY >= bounds.bottom)
    );
  };
  const resetSwipe = () => {
    swipe.current = null;
    if (dialog.current) dialog.current.style.transform = "";
  };
  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (window.history.state?.gotoreSheet !== key)
      window.history.pushState({ ...window.history.state, gotoreSheet: key, gotoreBack: true }, "");
    const back = () => {
      if (window.history.state?.gotoreSheet !== key) close.current();
    };
    window.addEventListener("popstate", back);
    return () => {
      mounted.current = false;
      window.removeEventListener("popstate", back);
      // StrictModeの再接続では履歴を戻さず、実際に閉じた場合だけ戻す。
      queueMicrotask(() => {
        if (!mounted.current && window.history.state?.gotoreSheet === key) window.history.back();
      });
      element?.close();
      document.body.style.overflow = previous;
    };
  }, [key]);
  return (
    <dialog
      ref={dialog}
      className="v2-sheet"
      aria-label={title}
      onPointerDown={(event) => {
        backdropPointer.current =
          dismissOnBackdrop && event.isPrimary && event.button === 0 && outside(event)
            ? event.pointerId
            : null;
      }}
      onPointerUp={(event) => {
        const startedOutside = backdropPointer.current === event.pointerId;
        backdropPointer.current = null;
        if (startedOutside && outside(event)) close.current();
      }}
      onPointerCancel={() => {
        backdropPointer.current = null;
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="sheet-handle"
        aria-hidden="true"
        onPointerDown={(event) => {
          if (!dismissOnBackdrop || !event.isPrimary || event.button !== 0) return;
          swipe.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            distance: 0,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = swipe.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          current.distance = dy > Math.abs(dx) ? Math.max(0, dy) : 0;
          if (dialog.current)
            dialog.current.style.transform = `translateY(${Math.min(current.distance, 220)}px)`;
        }}
        onPointerUp={(event) => {
          const current = swipe.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const dismiss = current.distance >= 80;
          resetSwipe();
          if (dismiss) close.current();
        }}
        onPointerCancel={resetSwipe}
        onLostPointerCapture={resetSwipe}
      />
      <div className="section-heading">
        <h2>{title}</h2>
        {showCloseButton && (
          <button className="text-button" type="button" onClick={onClose}>
            閉じる
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
