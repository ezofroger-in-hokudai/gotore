import { api } from "@/lib/api";

export async function resourceRequest<T>(path: string, signal: AbortSignal): Promise<T> {
  const request = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new DOMException("取得を中止しました。", "AbortError"));
      request.abort();
    };
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    timer = setTimeout(() => {
      reject(new Error("読み込みに時間がかかっています。再試行してください。"));
      request.abort();
    }, 15_000);
  });
  try {
    // 認証待ち・本文の読み取りも期限に含め、遅れて届いた応答は採用しない。
    return await Promise.race([api<T>(path, { signal: request.signal }), deadline]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
