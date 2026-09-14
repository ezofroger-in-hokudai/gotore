import type { Group } from "@/lib/api";
import { useMemo, useState } from "react";
import { orderedGroups, parseGroupOrder } from "./group-order";

export function useGroupOrder(userId: string, groups: Group[] | null) {
  const key = `gotore:group-order:${userId}`;
  const [order, setOrder] = useState<string[]>(() => {
    try {
      return parseGroupOrder(localStorage.getItem(key));
    } catch {
      return [];
    }
  });
  const sorted = useMemo(() => orderedGroups(groups ?? [], order), [groups, order]);
  function save(ids: string[]) {
    if (groups === null) throw new Error("グループ未取得");
    const next = orderedGroups(groups ?? [], ids).map((group) => group.id);
    localStorage.setItem(key, JSON.stringify(next));
    setOrder(next);
  }
  return { groups: sorted, save };
}
