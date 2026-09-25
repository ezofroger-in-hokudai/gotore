import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordList } from "../../src/features/training/record-list";
import type { Workout } from "../../src/lib/api";

const record: Workout = {
  id: "record",
  user_id: "me",
  display_name: "本人",
  group_id: "group",
  performed_on: "2026-09-13",
  created_at: "2026-09-13T01:00:00Z",
  revision: 1,
  started_at: "2026-09-13T01:00:00Z",
  ended_at: "2026-09-13T01:48:00Z",
  exercises: [
    {
      name: "ベンチプレス",
      sets: [
        { weight: 95, reps: 1 },
        { weight: 80, reps: 10 },
      ],
    },
    { name: "自重", sets: [{ weight: 0, reps: 12 }] },
  ],
  best_sets: [{ exercise_index: 0, set_index: 1, weight: false, rm: true }],
};

test("本人の全セットを表で開き、日付と要約を一度だけ表示する", () => {
  const html = renderToStaticMarkup(
    <RecordList records={[record]} empty="" userId="me" personal />,
  );
  expect(html.match(/<table /g)).toHaveLength(2);
  expect(html.match(/<tr class="record-set/g)).toHaveLength(3);
  expect(html).toContain('scope="col">重量');
  expect(html).toContain('scope="col">回数');
  expect(html).toContain('scope="col">推定1RM');
  expect(html).toContain('aria-label="総負荷"');
  expect(html).toContain("895");
  expect(html).toContain("48");
  expect(html.match(/datetime="2026-09-13"/gi)).toHaveLength(1);
  expect(html).not.toContain("<details");
  expect(html).not.toContain("YOU");
  expect(html).not.toContain("本人");
  expect(html).toContain('aria-label="自己最高RM"');
  expect(html).toContain('class="personal-best-value">106.7');
  expect(html).toContain("—");
});

test("共有詳細は相手の名前を残し、本人だけの共有状態とメモを出さない", () => {
  const html = renderToStaticMarkup(<RecordList records={[record]} empty="" />);
  expect(html).toContain("本人");
  expect(html).not.toContain("共有済み");
  expect(html).not.toContain("メモ");
  expect(html).not.toContain("保存</time>");
});

test("旧記録に時間を作らず、進行中と実績0を区別する", () => {
  const old = {
    ...record,
    started_at: null,
    ended_at: null,
    exercises: [{ name: "自重", sets: [{ weight: 0, reps: 12 }] }],
  };
  const html = renderToStaticMarkup(<RecordList records={[old]} empty="" />);
  expect(html).not.toContain('aria-label="時間"');
  expect(html).toContain('aria-label="総負荷"');
  expect(html).toContain(">0<");
  const active = renderToStaticMarkup(
    <RecordList records={[{ ...record, ended_at: null }]} empty="" />,
  );
  expect(active).not.toContain("トレーニング中");
  expect(active).not.toContain('aria-label="時間"');
});
