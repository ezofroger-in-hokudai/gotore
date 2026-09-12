import { expect, test } from "bun:test";
import { SessionQueue } from "../../src/features/session/session-queue";
import type { TrainingSession } from "../../src/lib/api";

const initial: TrainingSession = {
  id: "s",
  user_id: "u",
  display_name: "本人",
  group_id: null,
  shared_group_ids: [],
  performed_on: "2026-09-09",
  created_at: "2026-09-09T00:00:00Z",
  started_at: "2026-09-09T00:00:00Z",
  ended_at: null,
  revision: 1,
  exercises: [],
};
const exercises = (n: number) => [
  { name: "ベンチ", sets: Array.from({ length: n }, () => ({ weight: 80, reps: 8 })) },
];
function fixture() {
  let stored: string | null = null;
  let server = structuredClone(initial);
  let fail = false;
  let loseResponse = false;
  let writes = 0;
  const options = {
    read: () => stored,
    write: (value: string | null) => {
      stored = value;
    },
    lock: async <T>(_name: string, work: () => Promise<T>) => work(),
    load: async () => structuredClone(server),
    send: async (_id: string, revision: number, values: TrainingSession["exercises"]) => {
      if (fail) throw new Error("offline");
      if (
        server.revision === revision + 1 &&
        JSON.stringify(server.exercises) === JSON.stringify(values)
      )
        return structuredClone(server);
      if (server.revision !== revision) throw Object.assign(new Error("conflict"), { status: 409 });
      server = { ...server, exercises: values, revision: revision + 1 };
      writes++;
      if (loseResponse) {
        loseResponse = false;
        throw new Error("lost response");
      }
      return structuredClone(server);
    },
  };
  return {
    options,
    queue: new SessionQueue(options),
    get server() {
      return server;
    },
    get stored() {
      return stored;
    },
    get writes() {
      return writes;
    },
    offline: (v: boolean) => {
      fail = v;
    },
    lose: () => {
      loseResponse = true;
    },
    remoteEdit: () => {
      server = { ...server, revision: server.revision + 1, exercises: exercises(5) };
    },
  };
}
test("通信なしで端末へ順番に追加し、編集と取消も同期順を保つ", async () => {
  const f = fixture();
  await f.queue.restore();
  await f.queue.enqueue(exercises(1), 1);
  await f.queue.enqueue(exercises(2), 2);
  await f.queue.enqueue(exercises(1), 3);
  expect(f.writes).toBe(0);
  expect(f.queue.state.session?.exercises[0].sets).toHaveLength(1);
  expect(f.queue.state.pending).toBe(3);
  await f.queue.sync();
  expect(f.queue.state.pending).toBe(0);
  expect(f.server.revision).toBe(4);
  expect(f.server.exercises[0].sets).toHaveLength(1);
});
test("通信失敗後の再起動でも未送信の複数セットを復元する", async () => {
  const f = fixture();
  await f.queue.restore();
  f.offline(true);
  await f.queue.enqueue(exercises(1), 1);
  await f.queue.enqueue(exercises(2), 2);
  await f.queue.sync();
  expect(f.queue.state.status).toBe("offline");
  const reopened = new SessionQueue(f.options);
  await reopened.restore();
  expect(reopened.state.session?.exercises[0].sets).toHaveLength(2);
  f.offline(false);
  await reopened.sync();
  expect(f.writes).toBe(2);
  expect(reopened.state.pending).toBe(0);
});
test("応答喪失後の再送は同じrevisionと内容で二重追加しない", async () => {
  const f = fixture();
  await f.queue.restore();
  f.lose();
  await f.queue.enqueue(exercises(1), 1);
  await f.queue.enqueue(exercises(2), 2);
  await f.queue.sync();
  expect(f.writes).toBe(1);
  const reopened = new SessionQueue(f.options);
  await reopened.restore();
  await reopened.sync();
  expect(f.writes).toBe(2);
  expect(f.server.exercises[0].sets).toHaveLength(2);
});
test("別端末との競合では未送信データを保持し、確認前に上書きしない", async () => {
  const f = fixture();
  await f.queue.restore();
  await f.queue.enqueue(exercises(1), 1);
  f.remoteEdit();
  await f.queue.sync();
  expect(f.queue.state.status).toBe("conflict");
  expect(f.queue.state.pending).toBe(1);
  expect(f.server.exercises[0].sets).toHaveLength(5);
  await expect(f.queue.enqueue(exercises(2), 2)).rejects.toThrow();
  expect(JSON.parse(f.stored as string).pending).toHaveLength(1);
});
test("永続化失敗を成功扱いにせず、古い画面からの更新も拒否する", async () => {
  const f = fixture();
  await f.queue.restore();
  await expect(f.queue.enqueue(exercises(1), 0)).rejects.toThrow();
  f.options.write = () => {
    throw new Error("quota");
  };
  await expect(f.queue.enqueue(exercises(1), 1)).rejects.toThrow();
  expect(f.queue.state.pending).toBe(0);
  expect(f.writes).toBe(0);
});

test("送信中に追加された末尾をACKで消さない", async () => {
  const f = fixture();
  await f.queue.restore();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const send = f.options.send;
  let first = true;
  f.options.send = async (...args) => {
    if (first) {
      first = false;
      await gate;
    }
    return send(...args);
  };
  await f.queue.enqueue(exercises(1), 1);
  const sending = f.queue.sync();
  await f.queue.enqueue(exercises(2), 2);
  release();
  await sending;
  expect(f.writes).toBe(2);
  expect(f.server.exercises[0].sets).toHaveLength(2);
});

test("同じブラウザの別画面から古いrevisionで待機列を上書きしない", async () => {
  const f = fixture();
  await f.queue.restore();
  const other = new SessionQueue(f.options);
  await other.restore();
  await f.queue.enqueue(exercises(1), 1);
  await expect(other.enqueue(exercises(2), 1)).rejects.toThrow();
  expect(JSON.parse(f.stored as string).pending).toHaveLength(1);
});

test("サーバー保存後に端末のACK記録が失敗しても再送で重複しない", async () => {
  const f = fixture();
  await f.queue.restore();
  await f.queue.enqueue(exercises(1), 1);
  const write = f.options.write;
  f.options.write = (value) => {
    if (value && JSON.parse(value).base.revision === 2) throw new Error("quota");
    write(value);
  };
  await f.queue.sync();
  expect(f.writes).toBe(1);
  expect(f.queue.state.pending).toBe(1);
  f.options.write = write;
  await f.queue.sync();
  expect(f.writes).toBe(1);
  expect(f.queue.state.pending).toBe(0);
});

test("150セットの送信待ちを重複保存せず、訂正と取消を含め全操作を同じ順で送る", async () => {
  const f = fixture();
  await f.queue.restore();
  const expected: TrainingSession["exercises"][] = [];
  let values: TrainingSession["exercises"] = [];
  for (let index = 0; index < 150; index++) {
    values = structuredClone(values);
    if (index % 30 === 0) values.push({ name: `種目${index / 30}`, sets: [] });
    values.at(-1)?.sets.push({ weight: 80, reps: 10 });
    expected.push(structuredClone(values));
    await f.queue.enqueue(values, index + 1);
  }
  const bytes = new TextEncoder().encode(f.stored as string).length;
  expect(bytes).toBeLessThan(40_000);
  values = structuredClone(values);
  values[0].sets[0] = { weight: 82.5, reps: 8 };
  expected.push(structuredClone(values));
  await f.queue.enqueue(values, 151);
  values = structuredClone(values);
  values[0].sets.splice(1, 1);
  expected.push(structuredClone(values));
  await f.queue.enqueue(values, 152);
  const sent: TrainingSession["exercises"][] = [];
  const send = f.options.send;
  f.options.send = async (...args) => {
    sent.push(structuredClone(args[2]));
    return send(...args);
  };
  const reopened = new SessionQueue(f.options);
  await reopened.restore();
  expect(reopened.state.session?.exercises).toEqual(values);
  await reopened.sync();
  expect(sent).toEqual(expected);
  expect(f.writes).toBe(152);
  expect(f.server.exercises).toEqual(values);
});

test("旧v1の操作IDと順序を保持し、読取だけでは上書きせず次の保存で移行する", async () => {
  const f = fixture();
  const legacy = JSON.stringify({
    base: initial,
    pending: [
      { id: "first", exercises: exercises(1) },
      { id: "second", exercises: exercises(2) },
    ],
  });
  f.options.write(legacy);
  await f.queue.restore();
  expect(f.stored).toBe(legacy);
  expect(f.queue.state.session?.exercises).toEqual(exercises(2));
  await f.queue.enqueue(exercises(3), 3);
  const saved = JSON.parse(f.stored as string);
  expect(saved.version).toBe(2);
  expect(saved.pending.map((job: { id: string }) => job.id).slice(0, 2)).toEqual([
    "first",
    "second",
  ]);
  // 旧クライアントの読取条件を満たさず、差分を空の全状態として誤送信させない。
  expect(saved.pending.every((job: { exercises?: unknown }) => Array.isArray(job.exercises))).toBe(
    false,
  );
  await f.queue.sync();
  expect(f.writes).toBe(3);
  expect(f.server.exercises).toEqual(exercises(3));
});

test("移行時の容量不足でも旧v1を保持し、再試行できる", async () => {
  const f = fixture();
  const legacy = JSON.stringify({
    base: initial,
    pending: [{ id: "old", exercises: exercises(1) }],
  });
  f.options.write(legacy);
  await f.queue.restore();
  const write = f.options.write;
  f.options.write = () => {
    throw new Error("quota");
  };
  await expect(f.queue.enqueue(exercises(2), 2)).rejects.toThrow("保存できません");
  expect(f.stored).toBe(legacy);
  expect(f.queue.state.pending).toBe(1);
  f.options.write = write;
  await f.queue.enqueue(exercises(2), 2);
  await f.queue.sync();
  expect(f.server.exercises).toEqual(exercises(2));
});

test("差分の基準と異なる保存応答は未送信を保持して停止する", async () => {
  const f = fixture();
  await f.queue.restore();
  await f.queue.enqueue(exercises(1), 1);
  await f.queue.enqueue(exercises(2), 2);
  f.options.send = async () => ({ ...initial, revision: 2, exercises: exercises(7) });
  await f.queue.sync();
  expect(f.queue.state.status).toBe("conflict");
  expect(f.queue.state.pending).toBe(2);
  expect(f.queue.state.session?.exercises).toEqual(exercises(2));
  const reopened = new SessionQueue(f.options);
  await reopened.restore();
  expect(reopened.state.status).toBe("conflict");
  expect(reopened.state.session?.exercises).toEqual(exercises(2));
});

test("種目の並べ替え・削除・全取消でも操作を復元し、入力元を変更しない", async () => {
  const f = fixture();
  await f.queue.restore();
  const first = [
    { name: "A", sets: [{ weight: 0, reps: 12 }] },
    { name: "B", sets: [{ weight: 82.5, reps: 8 }] },
    { name: "A", sets: [{ weight: 60, reps: 10 }] },
  ];
  const snapshots = [first, [first[1], first[0], first[2]], [first[2]], [], exercises(1)];
  const original = structuredClone(snapshots);
  for (const [index, values] of snapshots.entries()) await f.queue.enqueue(values, index + 1);
  expect(snapshots).toEqual(original);
  const sent: TrainingSession["exercises"][] = [];
  const send = f.options.send;
  f.options.send = async (...args) => {
    sent.push(structuredClone(args[2]));
    return send(...args);
  };
  await f.queue.sync();
  expect(sent).toEqual(original);
  expect(f.queue.state.pending).toBe(0);
});

test("同じ端末の2つのキューが同時に同期しても各操作を一度ずつ確定する", async () => {
  const f = fixture();
  const locks = new Map<string, Promise<void>>();
  f.options.lock = async (name, work) => {
    const previous = locks.get(name);
    let release = () => {};
    locks.set(
      name,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  };
  await f.queue.restore();
  await f.queue.enqueue(exercises(1), 1);
  await f.queue.enqueue(exercises(2), 2);
  const other = new SessionQueue(f.options);
  await other.restore();
  await other.enqueue(exercises(3), 3);
  await Promise.all([f.queue.sync(), other.sync()]);
  expect(f.writes).toBe(3);
  expect(f.server.exercises).toEqual(exercises(3));
  expect(JSON.parse(f.stored as string).pending).toHaveLength(0);
});

for (const corrupt of [
  { version: 9, pending: [] },
  {
    version: 2,
    pending: [{ id: "bad", change: { kind: "exercises", start: 2, remove: 0, values: [] } }],
  },
  {
    version: 2,
    pending: [
      {
        id: "bad",
        change: {
          kind: "sets",
          exercise: 0,
          start: 0,
          remove: 0,
          values: [{ weight: 80, reps: -1 }],
        },
      },
    ],
  },
  { version: 2, pending: [{ id: "bad", change: { kind: "unknown" } }] },
]) {
  test(`壊れた差分と未対応形式を上書きせず保持する ${JSON.stringify(corrupt)}`, async () => {
    const f = fixture();
    const raw = JSON.stringify({ base: initial, ...corrupt });
    f.options.write(raw);
    await f.queue.restore();
    expect(f.queue.state.status).toBe("offline");
    expect(f.queue.state.error).toContain("読み取れません");
    await f.queue.sync();
    expect(f.stored).toBe(raw);
    expect(f.writes).toBe(0);
  });
}
