type Receive = (kind: "stamp" | "start", count: number) => void;

export function startDemoAutoplay(receive: Receive) {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;
  const random = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
  function clear() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }
  function schedule(kind: "stamp" | "start", delay: number) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (stopped || document.visibilityState !== "visible") return;
      receive(kind, kind === "stamp" ? random(8, 20) : random(1, 4));
      schedule(kind, kind === "stamp" ? random(8_000, 15_000) : random(25_000, 40_000));
    }, delay);
    timers.add(timer);
  }
  function resume() {
    clear();
    if (stopped || document.visibilityState !== "visible") return;
    schedule("stamp", 4_000);
    schedule("start", 12_000);
  }
  // 非表示中の通知を溜めず、戻った時点から体験を再開する。
  document.addEventListener("visibilitychange", resume);
  resume();
  return () => {
    stopped = true;
    clear();
    document.removeEventListener("visibilitychange", resume);
  };
}
