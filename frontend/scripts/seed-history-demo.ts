import { createHash } from "node:crypto";
import { localAuth, testPassword } from "../tests/e2e/local-auth";

const email = "go@go.to";
const previousEmail = "history-demo-2026@example.test";
const name = "履歴デモ";
const apiBase = "http://127.0.0.1:8000/api";
const { admin, publicAuth } = localAuth();

let signedIn = await publicAuth.signInWithPassword({ email, password: testPassword });
if (signedIn.error) {
  const previous = await publicAuth.signInWithPassword({
    email: previousEmail,
    password: testPassword,
  });
  if (previous.data.user) {
    const updated = await admin.updateUserById(previous.data.user.id, {
      email,
      email_confirm: true,
    });
    if (updated.error) throw new Error(`デモアカウントのメール変更に失敗: ${updated.error.code}`);
  } else {
    const created = await admin.createUser({
      email,
      password: testPassword,
      email_confirm: true,
      user_metadata: { display_name: name },
    });
    if (created.error) throw new Error(`デモアカウントの作成に失敗: ${created.error.code}`);
  }
  signedIn = await publicAuth.signInWithPassword({ email, password: testPassword });
}
if (signedIn.error || !signedIn.data.session) throw new Error("デモアカウントにログインできません");
const token = signedIn.data.session.access_token;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

type Group = { id: string; name: string };
type RecordId = { id: string };
await request("/exercise-options");
const existingGroups = await request<Group[]>("/groups");
const group =
  existingGroups.find((item) => item.name === "履歴デモグループ") ??
  (await request<Group>("/groups", {
    method: "POST",
    body: JSON.stringify({ name: "履歴デモグループ" }),
  }));

// デモ記録の基準日を固定し、日付が変わっても再実行で重複を作らない。
const current = "2026-09-28";
const latestSampleDate = "2026-09-29";
const start = new Date(`${current}T12:00:00Z`);
const dateBefore = (days: number) => {
  const value = new Date(start);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
};
const first = dateBefore(364);
const deterministicId = (key: string) => {
  const hash = createHash("sha256").update(key).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const dates = new Set<string>();
for (let week = 0; week < 52; week++) {
  dates.add(dateBefore(364 - week * 7));
  dates.add(dateBefore(361 - week * 7));
}
for (const days of [3, 2, 1, 0]) dates.add(dateBefore(days));

const present = new Set<string>();
for (let offset = 0; ; offset += 50) {
  const page = await request<RecordId[]>(
    `/workouts?date_from=${first}&date_to=${latestSampleDate}&limit=50&offset=${offset}`,
  );
  for (const item of page) present.add(item.id);
  if (page.length < 50) break;
}

const patterns = [
  ["ベンチプレス", "ペックフライ"],
  ["スクワット", "デッドリフト"],
  ["ラットプルダウン", "懸垂"],
  ["ショルダープレス", "ベンチプレス"],
];
let created = 0;
for (const [index, performed_on] of [...dates].sort().entries()) {
  const id = deterministicId(`history-demo:${performed_on}`);
  if (present.has(id)) continue;
  const age = Math.round(
    (start.getTime() - new Date(`${performed_on}T12:00:00Z`).getTime()) / 86_400_000,
  );
  const pattern = age <= 3 ? patterns[3 - age] : patterns[index % patterns.length];
  await request("/workouts", {
    method: "POST",
    body: JSON.stringify({
      id,
      performed_on,
      group_id: group.id,
      exercises: pattern.map((exercise, exerciseIndex) => ({
        name: exercise,
        sets: Array.from({ length: 3 + (index % 2) }, (_, setIndex) => ({
          weight: Math.max(20, 35 + exerciseIndex * 12 + Math.floor(index / 7) + setIndex * 2),
          reps: Math.max(5, 12 - setIndex * 2),
        })),
      })),
    }),
  });
  created++;
}

// 月内の軽い日から重い日までを用意し、カレンダーの濃淡と複数セットを確認する。
const calendarSamples = [
  { date: "2026-09-05", name: "ベンチプレス", weights: [20, 25], reps: [10, 10] },
  { date: "2026-09-09", name: "ラットプルダウン", weights: [30, 35, 40], reps: [12, 10, 8] },
  { date: "2026-09-13", name: "スクワット", weights: [50, 55, 60], reps: [12, 10, 8] },
  { date: "2026-09-18", name: "ショルダープレス", weights: [40, 45, 50, 55], reps: [12, 10, 8, 6] },
  { date: "2026-09-22", name: "ベンチプレス", weights: [55, 60, 65, 70], reps: [12, 10, 8, 6] },
  { date: "2026-09-29", name: "デッドリフト", weights: [90, 95, 100, 105], reps: [10, 8, 6, 4] },
];
for (const sample of calendarSamples) {
  const id = deterministicId(`history-demo-calendar:${sample.date}`);
  if (present.has(id)) continue;
  await request("/workouts", {
    method: "POST",
    body: JSON.stringify({
      id,
      performed_on: sample.date,
      group_id: group.id,
      exercises: [
        {
          name: sample.name,
          sets: sample.weights.map((weight, index) => ({ weight, reps: sample.reps[index] })),
        },
      ],
    }),
  });
  created++;
}

const summary = await request<{ workout_count: number }>("/history/summary");
const groupGraph = await request<{ series: { month?: unknown[]; week?: unknown[] } }>(
  `/groups/${group.id}/analytics?period=all&body_part=chest`,
);
if (
  summary.workout_count < dates.size ||
  (groupGraph.series.month?.length ?? 0) < 12 ||
  !groupGraph.series.week?.length
)
  throw new Error(
    `投入後の履歴集計を確認できません: 個人${summary.workout_count}件、グループ胸の月${groupGraph.series.month?.length ?? 0}点・週${groupGraph.series.week?.length ?? 0}点`,
  );

console.log(
  `${name}: ${dates.size + calendarSamples.length}日分（今回追加 ${created}件）、${first}〜${latestSampleDate}、${group.name}`,
);
console.log(`ログイン: ${email} / ${testPassword}`);
