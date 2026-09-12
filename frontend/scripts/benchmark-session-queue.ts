import { unlink } from "node:fs/promises";
import { SessionQueue } from "../src/features/session/session-queue";
import type { Exercise, TrainingSession } from "../src/lib/api";

const baseline = process.argv[2] ?? "d81d7d7";
const source = Bun.spawnSync([
  "git",
  "show",
  `${baseline}:frontend/src/features/session/session-queue.ts`,
]);
if (source.exitCode) throw new Error("比較元のSessionQueueを取得できません");
const temporary = `/tmp/gotore-queue-baseline-${crypto.randomUUID()}.ts`;
await Bun.write(temporary, source.stdout);
const bytes = (value: string) => new TextEncoder().encode(value).length;
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const initial: TrainingSession = {
  id: "benchmark",
  user_id: "synthetic",
  display_name: "計測",
  group_id: null,
  shared_group_ids: [],
  performed_on: "2026-09-13",
  created_at: "2026-09-13T00:00:00Z",
  started_at: "2026-09-13T00:00:00Z",
  ended_at: null,
  revision: 1,
  exercises: [],
};

function operations(count: number) {
  const snapshots: Exercise[][] = [];
  let values: Exercise[] = [];
  for (let index = 0; index < count; index++) {
    values = structuredClone(values);
    if (index % 30 === 0) values.push({ name: `種目${index / 30 + 1}`, sets: [] });
    values.at(-1)?.sets.push({ weight: 80, reps: 10 });
    snapshots.push(values);
  }
  values = structuredClone(values);
  values[0].sets[0] = { weight: 82.5, reps: 8 };
  snapshots.push(values);
  values = structuredClone(values);
  values.at(-1)?.sets.pop();
  snapshots.push(values);
  return snapshots;
}

async function sample(Queue: typeof SessionQueue, snapshots: Exercise[][], count: number) {
  let stored: string | null = null;
  let server = structuredClone(initial);
  let sent = 0;
  let sentBytes = 0;
  const queue = new Queue({
    read: () => stored,
    write: (value) => {
      stored = value;
    },
    lock: async (_name, work) => work(),
    load: async () => server,
    send: async (id, revision, exercises) => {
      if (
        revision !== server.revision ||
        JSON.stringify(exercises) !== JSON.stringify(snapshots[sent])
      )
        throw new Error("操作順・内容が一致しません");
      sentBytes += bytes(JSON.stringify({ expected_revision: revision, exercises }));
      sent++;
      server = { ...server, id, revision: revision + 1, exercises };
      return structuredClone(server);
    },
  });
  await queue.restore();
  const elapsed: number[] = [];
  for (const [index, snapshot] of snapshots.entries()) {
    const start = performance.now();
    await queue.enqueue(snapshot, index + 1);
    elapsed.push(performance.now() - start);
  }
  const storedBytes = bytes(stored ?? "");
  await queue.sync();
  if (queue.state.pending || sent !== snapshots.length) throw new Error("全操作を同期できません");
  return {
    storedBytes,
    sentBytes,
    sent,
    last30AddMs: median(elapsed.slice(count - 30, count)),
    editMs: elapsed[count],
    undoMs: elapsed[count + 1],
  };
}

try {
  const old = (await import(temporary)).SessionQueue as typeof SessionQueue;
  const rows = [];
  for (const count of [30, 150, 600]) {
    const snapshots = operations(count);
    for (const [name, Queue] of [
      ["before", old],
      ["after", SessionQueue],
    ] as const) {
      await sample(Queue, snapshots, count);
      const results = [];
      for (let repeat = 0; repeat < 5; repeat++)
        results.push(await sample(Queue, snapshots, count));
      rows.push({
        count,
        name,
        storedBytes: results[0].storedBytes,
        sentBytes: results[0].sentBytes,
        operations: results[0].sent,
        last30AddMs: median(results.map((value) => value.last30AddMs)),
        editMs: median(results.map((value) => value.editMs)),
        undoMs: median(results.map((value) => value.undoMs)),
      });
    }
  }
  process.stdout.write(
    `${JSON.stringify({ baseline, samples: 5, storage: "memory", rows }, null, 2)}\n`,
  );
} finally {
  await unlink(temporary);
}
