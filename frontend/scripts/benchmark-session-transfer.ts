import { gunzipSync } from "node:zlib";
import type { Exercise } from "../src/lib/api";
import { sessionBody } from "../src/lib/session-transport";

function snapshots(count: number) {
  const exercises: Exercise[] = [];
  const bodies: string[] = [];
  const capture = () =>
    bodies.push(JSON.stringify({ expected_revision: bodies.length + 1, exercises }));
  for (let i = 0; i < count; i++) {
    if (i % 30 === 0)
      exercises.push({ name: `種目${exercises.length + 1} ベンチプレス`, sets: [] });
    exercises[exercises.length - 1].sets.push({ weight: 40 + (i % 31) * 2.5, reps: 5 + (i % 8) });
    capture();
  }
  exercises[0].sets[0].weight = 42.5;
  capture();
  exercises[exercises.length - 1].sets.pop();
  capture();
  return bodies;
}
const median = (samples: number[]) =>
  [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
const results = [];
for (const count of [30, 150, 600]) {
  const bodies = snapshots(count);
  const times: number[] = [];
  let plainBytes = 0;
  let sentBytes = 0;
  let compressed = 0;
  for (let run = 0; run < 6; run++) {
    plainBytes = 0;
    sentBytes = 0;
    compressed = 0;
    let elapsed = 0;
    for (const json of bodies) {
      const start = performance.now();
      const payload = await sessionBody(json, AbortSignal.timeout(15_000));
      elapsed += performance.now() - start;
      plainBytes += new Blob([json]).size;
      const body = payload.body;
      if (typeof body === "string") {
        sentBytes += new Blob([body]).size;
        if (body !== json) throw new Error("通常送信の内容が変化");
      } else if (body instanceof ArrayBuffer) {
        sentBytes += body.byteLength;
        compressed++;
        if (gunzipSync(Buffer.from(body)).toString() !== json)
          throw new Error("展開後の内容が変化");
      } else throw new Error("不明な本文");
    }
    if (run) times.push(elapsed / bodies.length);
  }
  results.push({
    sets: count,
    requests: bodies.length,
    plainBytes,
    sentBytes,
    compressed,
    reductionPercent: Math.round((1 - sentBytes / plainBytes) * 1000) / 10,
    meanPreparationMsMedian: median(times),
  });
}
console.log(JSON.stringify({ runtime: `Bun ${Bun.version}`, results }, null, 2));
