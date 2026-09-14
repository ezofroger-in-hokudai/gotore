export function parseGroupOrder(value: string | null): string[] {
  try {
    const ids: unknown = JSON.parse(value ?? "null");
    return Array.isArray(ids) && ids.every((id) => typeof id === "string") ? [...new Set(ids)] : [];
  } catch {
    return [];
  }
}

export function orderedGroups<T extends { id: string }>(groups: T[], order: string[]): T[] {
  const remaining = new Map(groups.map((group) => [group.id, group]));
  const result: T[] = [];
  for (const id of order) {
    const group = remaining.get(id);
    if (group) result.push(group);
    remaining.delete(id);
  }
  return [...result, ...remaining.values()];
}

export function moveGroup(order: string[], id: string, index: number): string[] {
  const from = order.indexOf(id);
  if (from < 0 || index < 0 || index >= order.length) return order;
  const next = order.filter((item) => item !== id);
  next.splice(index, 0, id);
  return next;
}
