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
  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (window.history.state?.gotoreSheet !== key)
      window.history.pushState({ ...window.history.state, gotoreSheet: key }, "");
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
      <div className="sheet-handle" />
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
