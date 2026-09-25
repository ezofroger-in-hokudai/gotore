import type { GroupActivity, TodayActivity } from "@/lib/api";

export type HomeFeed = {
  activity: GroupActivity;
  groupIds: ReadonlyMap<string, string>;
};

export function buildHomeFeed(data: TodayActivity | null, scope: string): HomeFeed | null {
  if (!data) return null;
  const groups =
    scope === "all" ? data.groups : data.groups.filter((group) => group.group_id === scope);
  if (!groups.length && scope !== "all") return null;

  const members = new Map<string, GroupActivity["members"][number]>();
  const feed = new Map<string, GroupActivity["feed"][number]>();
  const groupIds = new Map<string, string>();
  for (const group of groups) {
    for (const member of group.members) {
      const previous = members.get(member.id);
      members.set(member.id, {
        ...previous,
        ...member,
        live: !!previous?.live || member.live,
        today: !!previous?.today || member.today,
      });
    }
    for (const item of group.feed) {
      const previous = feed.get(item.workout_id);
      if (!previous || previous.updated_at < item.updated_at) feed.set(item.workout_id, item);
      if (!groupIds.has(item.workout_id)) groupIds.set(item.workout_id, group.group_id);
    }
  }
  const memberList = [...members.values()];
  return {
    activity: {
      group_id: groups[0]?.group_id ?? "",
      member_count: memberList.length,
      live_count: memberList.filter((member) => member.live).length,
      today_count: memberList.filter((member) => member.today).length,
      members: memberList,
      feed: [...feed.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    },
    groupIds,
  };
}
