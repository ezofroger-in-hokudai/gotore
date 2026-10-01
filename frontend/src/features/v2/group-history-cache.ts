import type { MonthlyActivity, Workout } from "@/lib/api";
import type { Analytics } from "../analytics/types";
import { ResourceCache } from "../training/resource-cache";
import { resourceRequest } from "../training/resource-request";

// Workspace の寿命に合わせ、所属を失ったグループの全履歴をまとめて消す。
export class GroupHistoryCache {
  readonly analytics: ResourceCache<Analytics>;
  readonly activity: ResourceCache<MonthlyActivity>;
  readonly days: ResourceCache<Workout[]>;

  constructor(request: <T>(path: string, signal: AbortSignal) => Promise<T> = resourceRequest) {
    const denied = (path: string) => this.removeGroup(path.split("/")[2]);
    this.analytics = new ResourceCache<Analytics>(request, Date.now, 60_000, 8, false, denied);
    this.activity = new ResourceCache<MonthlyActivity>(request, Date.now, 60_000, 5, false, denied);
    this.days = new ResourceCache(
      async (path, signal) => {
        const records = await request<Workout[]>(path, signal);
        this.days.preview(path, records, signal);
        let page = records;
        let result = records;
        while (page.length === 50 && !signal.aborted) {
          page = await request<Workout[]>(`${path}&offset=${result.length}`, signal);
          result = [...result, ...page];
        }
        return result;
      },
      Date.now,
      60_000,
      5,
      false,
      denied,
    );
  }
  private removeGroup(groupId: string) {
    const keep = (path: string) => path.split("/")[2] !== groupId;
    this.analytics.retainPaths(keep);
    this.activity.retainPaths(keep);
    this.days.retainPaths(keep);
  }
  retainGroups(groups: ReadonlySet<string>) {
    const keep = (path: string) => groups.has(path.split("/")[2]);
    this.analytics.retainPaths(keep);
    this.activity.retainPaths(keep);
    this.days.retainPaths(keep);
  }
  clear() {
    this.analytics.clear();
    this.activity.clear();
    this.days.clear();
  }
}
