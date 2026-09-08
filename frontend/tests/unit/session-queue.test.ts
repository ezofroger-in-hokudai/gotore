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
