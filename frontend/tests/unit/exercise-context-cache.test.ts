import { describe, expect, test } from "bun:test";
import { ExerciseContextCache } from "../../src/features/session/exercise-context-cache";
import type { ExerciseContext } from "../../src/lib/api";

const context: ExerciseContext = {
  best_weight: 60,
  best_rm: 80,
  previous: null,
  memo: { content: "", revision: 0 },
};
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function setup() {
  let time = 100_000;
  const requests: {
    name: string;
    signal: AbortSignal;
    resolve: (value: ExerciseContext) => void;
    reject: (error: Error) => void;
  }[] = [];
  const cache = new ExerciseContextCache(
    (name, signal) =>
      new Promise((resolve, reject) => {
        requests.push({ name, signal, resolve, reject });
      }),
    () => {},
    () => time,
  );
  return {
    cache,
    requests,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("種目比較の先読み", () => {
  test("取得中と取得済みを再利用し、同時取得を2件に抑える", async () => {
    const { cache, requests } = setup();
    cache.prepare(["a", "b", "c"], 0);
    expect(requests.map((request) => request.name)).toEqual(["a", "b"]);
    cache.prepare(["b", "a", "c"], 0);
    expect(requests).toHaveLength(2);
    requests[0].resolve(context);
    await flush();
    expect(requests[2].name).toBe("c");
    cache.prepare(["a", "b", "c"], 0);
    expect(requests).toHaveLength(3);
    expect(requests[2].signal.aborted).toBe(false);
    requests[1].resolve(context);
    requests[2].resolve(context);
    await flush();
    cache.prepare(["a", "b", "c"], 0);
    expect(requests).toHaveLength(3);
    expect(cache.read("b")?.data).toEqual(context);
  });

  test("新しく選んだ種目の取得枠を空け、中断後の応答を採用しない", async () => {
    const { cache, requests } = setup();
    cache.prepare(["a", "b", "c"], 0);
    cache.prepare(["c", "a", "b"], 0);
    expect(requests[1].signal.aborted).toBe(true);
    expect(requests[2].name).toBe("c");
    requests[1].resolve(context);
    await flush();
    expect(cache.read("b")?.data).toBeNull();
    cache.stop();
    requests[0].resolve(context);
    requests[2].resolve(context);
    await flush();
    expect(cache.read("c")?.data).toBeNull();
    expect(requests).toHaveLength(3);
  });

  test("保存確定時は比較を保持して更新し、失敗時は隠して再試行できる", async () => {
    const { cache, requests } = setup();
    cache.prepare(["a", "b"], 0);
    requests[0].resolve(context);
    await flush();
    cache.prepare(["a", "b"], 1);
    expect(cache.read("a")?.data).toEqual(context);
    expect(requests[1].signal.aborted).toBe(true);
    requests[2].reject(new Error("取得失敗"));
    await flush();
    expect(cache.read("a")?.data).toBeNull();
    expect(cache.read("a")?.error).toBe("取得失敗");
    const count = requests.length;
    cache.prepare(["a", "b"], 1);
    expect(requests).toHaveLength(count);
    cache.invalidate("a");
    cache.prepare(["a"], 1);
    requests.at(-1)?.resolve(context);
    await flush();
    expect(cache.read("a")?.data).toEqual(context);
  });

  test("60秒後に再取得し、保持する種目を5件に制限する", async () => {
    const { cache, requests, advance } = setup();
    cache.prepare(["a"], 0);
    requests[0].resolve(context);
    await flush();
    advance(60_001);
    cache.prepare(["a"], 0);
    expect(requests).toHaveLength(2);
    requests[1].resolve(context);
    await flush();
    for (const name of ["b", "c", "d", "e", "f"]) {
      cache.prepare([name], 0);
      requests.at(-1)?.resolve(context);
      await flush();
    }
    expect(cache.read("a")).toBeUndefined();
    expect(cache.read("f")?.data).toEqual(context);
  });
});
