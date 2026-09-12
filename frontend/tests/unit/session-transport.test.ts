import { afterEach, expect, test } from "bun:test";
import { ApiError, type Exercise, type TrainingSession } from "../../src/lib/api";
import { createSessionSender, sessionBody } from "../../src/lib/session-transport";

const nativeCompression = globalThis.CompressionStream;
afterEach(() => {
  globalThis.CompressionStream = nativeCompression;
});
const exercises: Exercise[] = [
  { name: "ベンチプレス", sets: Array.from({ length: 30 }, () => ({ weight: 82.5, reps: 8 })) },
  { name: "スクワット", sets: Array.from({ length: 30 }, () => ({ weight: 100, reps: 10 })) },
];
const json = JSON.stringify({ expected_revision: 42, exercises });
const result = { revision: 43, exercises } as TrainingSession;
const signal = () => AbortSignal.timeout(2000);

async function unpack(options: RequestInit) {
  if (typeof options.body === "string") return JSON.parse(options.body);
  const stream = new Response(options.body).body;
  if (!stream) throw new Error("本文なし");
  return new Response(stream.pipeThrough(new DecompressionStream("gzip"))).json();
}

test("大きい保存本文だけ圧縮し、Unicode・小数・全セットを保持する", async () => {
  const payload = await sessionBody(json, signal());
  expect(payload.headers).toEqual({ "Content-Encoding": "gzip" });
  expect((payload.body as ArrayBuffer).byteLength).toBeLessThan(new Blob([json]).size / 2);
  expect(await unpack(payload)).toEqual(JSON.parse(json));
  expect(await sessionBody("{}", signal())).toEqual({ body: "{}" });
});

test("圧縮非対応・失敗・圧縮しても短くならない場合は元のJSONを送る", async () => {
  globalThis.CompressionStream = undefined as unknown as typeof CompressionStream;
  expect(await sessionBody(json, signal())).toEqual({ body: json });
  globalThis.CompressionStream = class {
    constructor() {
      throw new Error("圧縮不可");
    }
  } as unknown as typeof CompressionStream;
  expect(await sessionBody(json, signal())).toEqual({ body: json });
  globalThis.CompressionStream =
    class extends TransformStream {} as unknown as typeof CompressionStream;
  expect(await sessionBody(json, signal())).toEqual({ body: json });
});

test("旧API拒否時だけ同じrevisionで1度再試行し、以降は通常送信する", async () => {
  for (const status of [400, 415]) {
    const calls: RequestInit[] = [];
    const send = createSessionSender(async (path, options) => {
      expect(path).toBe("/sessions/session-id");
      calls.push(options);
      expect(await unpack(options)).toEqual(JSON.parse(json));
      if (calls.length === 1) throw new ApiError("未対応", status);
      return result;
    });
    expect(await send("session-id", 42, exercises, signal())).toBe(result);
    expect(calls).toHaveLength(2);
    expect(calls[0].headers).toEqual({ "Content-Encoding": "gzip" });
    expect(calls[1].headers).toBeUndefined();
    expect(calls[1].body).toBe(json);
    expect(calls[1].signal).toBe(calls[0].signal);
    await send("session-id", 42, exercises, signal());
    expect(calls[2].body).toBe(json);
  }
});

test("認証・競合・検証エラー・通信失敗では追加送信せずキューへ返す", async () => {
  for (const reason of [
    ...[401, 403, 404, 409, 413, 422, 500].map((s) => new ApiError("失敗", s)),
    new Error("応答なし"),
  ]) {
    let calls = 0;
    const send = createSessionSender(async () => {
      calls++;
      throw reason;
    });
    await expect(send("id", 42, exercises, signal())).rejects.toBe(reason);
    expect(calls).toBe(1);
  }
});

test("通常送信の400は追加送信しない", async () => {
  let calls = 0;
  const send = createSessionSender(async () => {
    calls++;
    throw new ApiError("不正", 400);
  });
  await expect(send("id", 1, [], signal())).rejects.toThrow("不正");
  expect(calls).toBe(1);
});

test("中断済み・圧縮中・互換再試行前の中断で保存を送らない", async () => {
  await expect(sessionBody(json, AbortSignal.abort())).rejects.toThrow();
  const controller = new AbortController();
  globalThis.CompressionStream = class extends TransformStream {
    constructor() {
      super({ transform: () => controller.abort() });
    }
  } as typeof CompressionStream;
  await expect(sessionBody(json, controller.signal)).rejects.toThrow();
  globalThis.CompressionStream = nativeCompression;
  const retryController = new AbortController();
  let calls = 0;
  const send = createSessionSender(async () => {
    calls++;
    retryController.abort();
    throw new ApiError("未対応", 400);
  });
  await expect(send("id", 42, exercises, retryController.signal)).rejects.toThrow();
  expect(calls).toBe(1);
});
