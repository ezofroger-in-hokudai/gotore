import { type PointerEvent, type ReactNode, useEffect, useId, useRef } from "react";

export function Sheet({
  title,
  onClose,
  children,
  showCloseButton = true,
  dismissOnBackdrop = true,
  closeDisabled = false,
  variant = "bottom",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  showCloseButton?: boolean;
  dismissOnBackdrop?: boolean;
  closeDisabled?: boolean;
  variant?: "bottom" | "center";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPointer = useRef<number | null>(null);
  const swipe = useRef<{ pointerId: number; x: number; y: number; distance: number } | null>(null);
  const key = useId();
  const mounted = useRef(false);
  const close = useRef(onClose);
  const locked = useRef(closeDisabled);
  locked.current = closeDisabled;
  close.current = () => {
    if (!locked.current) onClose();
  };
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
  const startSwipe = (event: PointerEvent<HTMLElement>) => {
    if (closeDisabled || !dismissOnBackdrop || !event.isPrimary || event.button !== 0) return;
    swipe.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      distance: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveSwipe = (event: PointerEvent<HTMLElement>) => {
    const current = swipe.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    current.distance = dy > Math.abs(dx) ? Math.max(0, dy) : 0;
    if (dialog.current)
      dialog.current.style.transform = `translateY(${Math.min(current.distance, 220)}px)`;
  };
  const endSwipe = (event: PointerEvent<HTMLElement>) => {
    const current = swipe.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dismiss = current.distance >= 80;
    resetSwipe();
    if (dismiss) close.current();
  };
  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (window.history.state?.gotoreSheet !== key)
      window.history.pushState({ ...window.history.state, gotoreSheet: key, gotoreBack: true }, "");
    const back = (event: PopStateEvent) => {
      if (locked.current) {
        // 送信中に戻っても、外側の画面が先に確認を破棄しない。
        event.stopImmediatePropagation();
        if (window.history.state?.gotoreSheet !== key) window.history.forward();
        return;
      }
      if (window.history.state?.gotoreSheet !== key) close.current();
    };
    window.addEventListener("popstate", back, true);
    return () => {
      mounted.current = false;
      window.removeEventListener("popstate", back, true);
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
      className={variant === "center" ? "v2-sheet v2-sheet-center" : "v2-sheet"}
      aria-label={title}
      onPointerDown={(event) => {
        backdropPointer.current =
          !closeDisabled &&
          dismissOnBackdrop &&
          event.isPrimary &&
          event.button === 0 &&
          outside(event)
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
        close.current();
      }}
    >
      {variant === "bottom" && (
        <div
          className="sheet-handle"
          aria-hidden="true"
          onPointerDown={startSwipe}
          onPointerMove={moveSwipe}
          onPointerUp={endSwipe}
          onPointerCancel={resetSwipe}
          onLostPointerCapture={resetSwipe}
        />
      )}
      {variant === "bottom" && (
        <div
          className="section-heading sheet-drag-region"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            startSwipe(event);
          }}
          onPointerMove={moveSwipe}
          onPointerUp={endSwipe}
          onPointerCancel={resetSwipe}
          onLostPointerCapture={resetSwipe}
        >
          <h2>{title}</h2>
          {showCloseButton && (
            <button
              className="text-button"
              type="button"
              disabled={closeDisabled}
              onClick={() => close.current()}
            >
              閉じる
            </button>
          )}
        </div>
      )}
      {children}
    </dialog>
  );
}
