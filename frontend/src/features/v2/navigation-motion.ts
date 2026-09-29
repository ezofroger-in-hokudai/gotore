import { flushSync } from "react-dom";

type Direction = "forward" | "back";
let activeTransition: ViewTransition | null = null;
let operationId = 0;

export function runNavigationMotion(update: () => void, direction: Direction) {
  const currentOperation = ++operationId;
  activeTransition?.skipTransition();
  activeTransition = null;
  const root = document.documentElement;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    delete root.dataset.gotoreNavigationDirection;
    flushSync(update);
    return;
  }

  root.dataset.gotoreNavigationDirection = direction;
  if (!document.startViewTransition) {
    flushSync(update);
    document
      .querySelector<HTMLElement>(".v2-app .main-content")
      ?.animate(
        [
          { transform: `translateX(${direction === "forward" ? 18 : -18}px)` },
          { transform: "translateX(0)" },
        ],
        { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    delete root.dataset.gotoreNavigationDirection;
    return;
  }

  const transition = document.startViewTransition(() => {
    if (currentOperation === operationId) flushSync(update);
  });
  activeTransition = transition;
  // 連続操作で意図的に中断した遷移のready拒否をページエラーにしない。
  void transition.ready.catch(() => {});
  const cleanup = () => {
    if (activeTransition !== transition) return;
    activeTransition = null;
    delete root.dataset.gotoreNavigationDirection;
  };
  void transition.finished.then(cleanup, cleanup);
}
