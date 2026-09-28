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
    document.querySelector<HTMLElement>(".v2-app .main-content")?.animate(
      [
        { opacity: 0.78, transform: `translateX(${direction === "forward" ? 18 : -18}px)` },
        { opacity: 1, transform: "translateX(0)" },
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
  const cleanup = () => {
    if (activeTransition !== transition) return;
    activeTransition = null;
    delete root.dataset.gotoreNavigationDirection;
  };
  void transition.finished.then(cleanup, cleanup);
}
