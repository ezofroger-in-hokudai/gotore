import { describe, expect, test } from "bun:test";
import { MemoDeliveryStore, type MemoTarget } from "../../src/features/training/memo-delivery";
const target: MemoTarget = { path: "/workouts/record-a/memo", label: "記録全体のメモ" };
function setup(send: ConstructorParameters<typeof MemoDeliveryStore>[2]) {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    keys: () => [...values.keys()],
  };
  return { values, storage, store: new MemoDeliveryStore("user-a", storage, send) };
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
describe("メモの送信状態", () => {
  test("送信中の新しい編集を古い成功で消さず、次の保存は新しいrevisionで送る", async () => {
    let complete: (value: { content: string; revision: number }) => void = () => {};
    const writes: { content: string; revision: number }[] = [];
    const { store, values } = setup(async (_target, memo) => {
      writes.push(memo);
      if (writes.length === 1)
        return new Promise((resolve) => {
          complete = resolve;
        });
      return { ...memo, revision: memo.revision + 1 };
    });
    store.prime(target, { content: "", revision: 0 });
    store.edit(target, "最初");
    expect(store.enqueue(target)).toBe(true);
    expect(store.read(target).phase).toBe("sending");
    store.edit(target, "新しい編集");
    store.enqueue(target);
    complete({ content: "最初", revision: 1 });
    await flush();
    expect(writes).toEqual([
      { content: "最初", revision: 0 },
      { content: "新しい編集", revision: 1 },
    ]);
    expect(store.read(target).content).toBe("新しい編集");
    expect(store.read(target).memo?.revision).toBe(2);
    expect([...values.keys()]).toHaveLength(0);
  });
  test("失敗・再起動でも元revisionを保持し、別ユーザーの要求を読み込まない", async () => {
    const { store, storage, values } = setup(async () => {
      throw Error("通信失敗");
    });
    store.prime(target, { content: "", revision: 3 });
    store.edit(target, "残す");
    store.enqueue(target);
    await flush();
    expect(store.read(target).phase).toBe("error");
    const sent: { content: string; revision: number }[] = [];
    const other = new MemoDeliveryStore("user-b", storage, async () => {
      throw Error("送らない");
    });
    other.restore();
    expect(other.pending()).toHaveLength(0);
    const restarted = new MemoDeliveryStore("user-a", storage, async (_target, memo) => {
      sent.push(memo);
      return { ...memo, revision: 4 };
    });
    restarted.restore();
    await flush();
    expect(sent).toEqual([{ content: "残す", revision: 3 }]);
    expect([...values.keys()]).toHaveLength(0);
  });
  test("端末保存できなければ受付成功を返さず、入力をメモリに残す", async () => {
    const { store, storage } = setup(async (_target, memo) => ({ ...memo, revision: 1 }));
    storage.setItem = () => {
      throw Error("容量不足");
    };
    store.prime(target, { content: "", revision: 0 });
    store.edit(target, "消さない");
    expect(store.enqueue(target)).toBe(false);
    expect(store.read(target).content).toBe("消さない");
    expect(store.read(target).storageError).toBe(true);
  });
  test("ログアウトで停止した応答は下書きを消さず、続きの要求も送らない", async () => {
    let complete: (value: { content: string; revision: number }) => void = () => {};
    let writes = 0;
    const { store, values } = setup(async () => {
      writes++;
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    store.prime(target, { content: "", revision: 0 });
    store.edit(target, "最初");
    store.enqueue(target);
    store.edit(target, "次");
    store.enqueue(target);
    store.stop();
    complete({ content: "最初", revision: 1 });
    await flush();
    expect(writes).toBe(1);
    expect([...values.keys()].length).toBeGreaterThan(0);
  });
  test("古い取得結果は保存結果や未送信編集を戻さない", async () => {
    const { store } = setup(async (_target, memo) => ({ ...memo, revision: 2 }));
    store.prime(target, { content: "旧", revision: 1 });
    store.edit(target, "新");
    store.enqueue(target);
    await flush();
    store.prime(target, { content: "旧", revision: 1 });
    expect(store.read(target).content).toBe("新");
    store.edit(target, "");
    store.prime(target, { content: "新版", revision: 3 });
    expect(store.read(target).content).toBe("");
  });
});
