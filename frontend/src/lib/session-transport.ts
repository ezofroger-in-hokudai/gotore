import { ApiError, type Exercise, type TrainingSession } from "./api";

export async function sessionBody(json: string, signal: AbortSignal): Promise<RequestInit> {
  signal.throwIfAborted();
  const source = new Blob([json]);
  if (source.size < 1024 || typeof CompressionStream === "undefined") return { body: json };
  try {
    const stream = source.stream().pipeThrough(new CompressionStream("gzip"), { signal });
    const body = await new Response(stream).arrayBuffer();
    signal.throwIfAborted();
    if (body.byteLength < source.size) return { body, headers: { "Content-Encoding": "gzip" } };
  } catch {
    signal.throwIfAborted();
  }
  return { body: json };
}

type Request = (path: string, options: RequestInit) => Promise<TrainingSession>;

export function createSessionSender(request: Request) {
  let compressionSupported = true;
  return async (
    id: string,
    revision: number,
    exercises: Exercise[],
    signal = AbortSignal.timeout(15_000),
  ) => {
    const json = JSON.stringify({ expected_revision: revision, exercises });
    const payload = compressionSupported ? await sessionBody(json, signal) : { body: json };
    signal.throwIfAborted();
    try {
      return await request(`/sessions/${id}`, { ...payload, method: "PATCH", signal });
    } catch (reason) {
      // 旧APIはgzipを保存前に400で拒否する。同じrevisionで通常送信へ戻す。
      if (
        typeof payload.body === "string" ||
        !(reason instanceof ApiError) ||
        ![400, 415].includes(reason.status)
      )
        throw reason;
      compressionSupported = false;
      signal.throwIfAborted();
      return request(`/sessions/${id}`, { method: "PATCH", body: json, signal });
    }
  };
}
