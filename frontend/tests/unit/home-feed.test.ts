import { describe, expect, test } from "bun:test";
import { buildHomeFeed } from "../../src/features/v2/home-feed";
import type { TodayActivity } from "../../src/lib/api";

const data: TodayActivity = {
  groups: [
    {
      group_id: "first",
      name: "朝トレ部",
      member_count: 1,
      live_count: 1,
      today_count: 1,
      members: [{ id: "one", display_name: "一郎", live: true, today: true }],
      feed: [
        {
          workout_id: "shared",
          user_id: "one",
          display_name: "一郎",
          exercise: "ベンチプレス",
          weight: 80,
          reps: 8,
          estimated_rm: 100,
          updated_at: "2026-09-26T09:00:00Z",
          best: false,
        },
      ],
    },
    {
      group_id: "second",
      name: "大学トレ部",
      member_count: 2,
      live_count: 0,
      today_count: 2,
      members: [
        { id: "one", display_name: "一郎", live: false, today: true },
        { id: "two", display_name: "二郎", live: false, today: true },
      ],
      feed: [
        {
          workout_id: "latest",
          user_id: "two",
          display_name: "二郎",
          exercise: "スクワット",
          weight: 100,
          reps: 5,
          estimated_rm: 116.7,
          updated_at: "2026-09-26T10:00:00Z",
          best: true,
        },
        {
          workout_id: "shared",
          user_id: "one",
          display_name: "一郎",
          exercise: "ベンチプレス",
          weight: 80,
          reps: 8,
          estimated_rm: 100,
          updated_at: "2026-09-26T09:00:00Z",
          best: false,
        },
      ],
    },
  ],
};

describe("buildHomeFeed", () => {
  test("すべては共有先が重なる記録とメンバーを重複させず最新順にする", () => {
    const result = buildHomeFeed(data, "all");
    expect(result?.activity.feed.map((item) => item.workout_id)).toEqual(["latest", "shared"]);
    expect(result?.activity.members).toHaveLength(2);
    expect(result?.activity.live_count).toBe(1);
    expect(result?.groupIds.get("latest")).toBe("second");
    expect(result?.groupIds.get("shared")).toBe("first");
  });

  test("下段の表示範囲だけで個別グループへ絞り込む", () => {
    const result = buildHomeFeed(data, "second");
    expect(result?.activity.feed.map((item) => item.workout_id)).toEqual(["latest", "shared"]);
    expect(result?.activity.group_id).toBe("second");
    expect(result?.groupIds.get("shared")).toBe("second");
  });
});
