import { type ReactNode, useEffect, useId, useRef } from "react";

export function Sheet({
  title,
  onClose,
  children,
}: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const key = useId();
  const mounted = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
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
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="sheet-handle" />
      <div className="section-heading">
        <h2>{title}</h2>
        <button className="text-button" type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
      {children}
    </dialog>
  );
}
