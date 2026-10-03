import {
  ApiError,
  type Exercise,
  type ExerciseOption,
  type Group,
  type TrainingSession,
  type Workout,
} from "@/lib/api";
import type { Analytics, Totals } from "../analytics/types";
import type { ActivityNotification, NotificationSettings } from "../notifications/types";
export const demoNames = [
  "柳町和音",
  "森下快",
  "山田葵",
  "佐藤蓮",
  "鈴木陽菜",
  "田中悠",
  "伊藤咲",
  "渡辺陸",
  "小林楓",
  "加藤湊",
  "吉田結",
  "山本蒼",
];
const kinds = ["encourage", "push", "bad", "amazing", "praise", "tengu"] as const;
function date(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export type DemoState = {
  userId: string;
  name: string;
  groups: Group[];
  options: ExerciseOption[];
  session: TrainingSession | null;
  records: Workout[];
  notices: ActivityNotification[];
  seen: string[];
  read?: string[];
  sequence: number;
  settings: NotificationSettings;
  memos: Record<string, { content: string; revision: number }>;
  stamps: Record<string, { counts: Record<string, number>; mine: string[]; can_send: boolean }>;
  avatar: { version: string | null; data_url: string | null };
};
function seed(userId: string): DemoState {
  const group = {
    id: "demo-ezofrogs",
    name: "ezofrogs",
    owner_id: userId,
    invite_code: "EZOFROGS",
  };
  const options: ExerciseOption[] = [
    "ベンチプレス",
    "スクワット",
    "デッドリフト",
    "ラットプルダウン",
    "ショルダープレス",
  ].map((name, i) => ({
    id: `demo-option-${i}`,
    name,
    revision: 1,
    primary_body_part: (["chest", "legs", "back", "back", "shoulders"] as const)[i],
    secondary_body_parts: [],
    last_performed_on: date(-i * 2 - 1),
  }));
  const record = (
    id: string,
    uid: string,
    display_name: string,
    offset: number,
    i: number,
  ): Workout => ({
    id,
    user_id: uid,
    display_name,
    group_id: group.id,
    shared_group_ids: [group.id],
    performed_on: date(offset),
    created_at: new Date(Date.now() + offset * 86400000).toISOString(),
    started_at: new Date(Date.now() + offset * 86400000 - 1800000).toISOString(),
    ended_at: new Date(Date.now() + offset * 86400000).toISOString(),
    revision: 1,
    exercises: [
      {
        name: options[i % 3].name,
        sets: [
          { weight: 70 + i * 2.5, reps: 8 },
          { weight: 70 + i * 2.5, reps: 10 },
        ],
      },
    ],
  });
  const records = Array.from({ length: 14 }, (_, i) =>
    record(`demo-history-${i}`, userId, "高木透", -i * 2 - 1, 13 - i),
  );
  records.push(
    ...demoNames.slice(0, 5).map((name, i) => ({
      ...record(`demo-peer-${i}`, `demo-peer-user-${i}`, name, 0, i),
      ended_at: i < 3 ? null : new Date().toISOString(),
    })),
  );
  return {
    userId,
    name: "高木透",
    groups: [group],
    options,
    session: null,
    records,
    notices: [],
    seen: [],
    sequence: 0,
    settings: {
      stamp_enabled: true,
      start_enabled: true,
      start_timing: "home",
      vibration: true,
      sound: false,
      push_stamp: false,
      push_start: false,
    },
    memos: {},
    stamps: {},
    avatar: { version: null, data_url: null },
  };
}
type Body = {
  id?: string;
  started_at?: string;
  expected_revision?: number;
  exercises?: Exercise[];
  name?: string;
  content?: string;
  ids?: string[];
  workout_ids?: string[];
  kind?: string;
  member_id?: string;
  shared_group_ids?: string[];
  performed_on?: string;
  primary_body_part?: ExerciseOption["primary_body_part"];
  secondary_body_parts?: ExerciseOption["secondary_body_parts"];
  data_url?: string;
  workouts?: { id: string }[];
  options?: { id: string }[];
};
export class DemoStore {
  state: DemoState;
  constructor(userId: string, state?: DemoState) {
    this.state = state || seed(userId);
  }
  receive(kind: "stamp" | "start", count: number) {
    for (let i = 0; i < count; i++) {
      const index = count === 1 ? this.state.sequence % demoNames.length : i % demoNames.length;
      if (kind === "start") {
        const uid = `demo-peer-user-${index}`;
        const existing = this.state.records.find(
          (x) => x.user_id === uid && x.performed_on === date(),
        );
        if (existing) existing.ended_at = null;
        else
          this.state.records.push({
            id: `demo-peer-${index}`,
            user_id: uid,
            display_name: demoNames[index],
            group_id: this.state.groups[0]?.id || null,
            shared_group_ids: this.state.groups.map((x) => x.id),
            performed_on: date(),
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            ended_at: null,
            revision: 1,
            exercises: [],
          });
      }
      this.state.notices.push({
        id: `demo-notice-${++this.state.sequence}`,
        kind,
        sender_id: `demo-peer-user-${index}`,
        display_name: demoNames[index],
        avatar_version: null,
        workout_id:
          kind === "stamp"
            ? this.state.session?.id || this.own()[0]?.id || `demo-peer-${index % 5}`
            : `demo-peer-${index}`,
        stamp_kind: kind === "stamp" ? kinds[i % 6] : null,
        created_at: new Date().toISOString(),
        live_until: kind === "start" ? new Date(Date.now() + 3600000).toISOString() : null,
      });
    }
  }
  async request(path: string, options: RequestInit = {}) {
    options.signal?.throwIfAborted();
    const url = new URL(path, "https://demo.invalid");
    let body: Body = {};
    if (options.body) {
      const source = new Response(options.body);
      const text =
        new Headers(options.headers).get("Content-Encoding") === "gzip"
          ? await new Response(source.body?.pipeThrough(new DecompressionStream("gzip"))).text()
          : await source.text();
      if (new Headers(options.headers).get("Content-Type")?.startsWith("image/")) {
        const bytes = new Uint8Array(await new Response(options.body).arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        body = { data_url: `data:image/jpeg;base64,${btoa(binary)}` };
      } else body = JSON.parse(text);
    }
    const result = this.handle(url.pathname, url.searchParams, options.method || "GET", body);
    options.signal?.throwIfAborted();
    return structuredClone(result);
  }
  private own() {
    return this.state.records.filter((x) => x.user_id === this.state.userId);
  }
  private all() {
    return [...(this.state.session ? [this.state.session] : []), ...this.state.records];
  }
  private totals(records: Workout[]) {
    const sets = records.flatMap((x) => x.exercises.flatMap((e) => e.sets));
    return {
      set_count: sets.length,
      total_volume: sets.reduce((a, x) => a + x.weight * x.reps, 0),
    };
  }
  private activity(group: Group) {
    const records = this.all().filter(
      (x) => x.performed_on === date() && x.shared_group_ids?.includes(group.id),
    );
    const members = [
      { id: this.state.userId, display_name: this.state.name },
      ...demoNames.map((display_name, i) => ({ id: `demo-peer-user-${i}`, display_name })),
    ].map((x) => ({
      ...x,
      live: records.some((r) => r.user_id === x.id && !r.ended_at),
      today: records.some((r) => r.user_id === x.id),
      live_until: new Date(Date.now() + 3600000).toISOString(),
    }));
    return {
      name: group.name,
      group_id: group.id,
      observed_at: new Date().toISOString(),
      member_count: members.length,
      live_count: members.filter((x) => x.live).length,
      today_count: members.filter((x) => x.today).length,
      members,
      totals: this.totals(records),
      feed: records
        .filter((x) => x.exercises.some((e) => e.sets.length))
        .map((x) => {
          const e = x.exercises.find((e) => e.sets.length) || x.exercises[0];
          return {
            workout_id: x.id,
            user_id: x.user_id,
            display_name: x.display_name,
            exercise: e.name,
            ...e.sets[0],
            estimated_rm: null,
            updated_at: x.created_at,
            best: false,
            summary: { ...this.totals([x]), exercise_count: x.exercises.length },
          };
        }),
    };
  }
  private analytics(records: Workout[], q: URLSearchParams): Analytics {
    const period = (q.get("period") || "month") as Analytics["window"]["period"];
    const offset = Number(q.get("offset") || 0);
    const n = period === "week" ? 7 : period === "month" ? 30 : 365;
    const start = date(-n + 1 + offset * n);
    const end = date(offset * n);
    const selected = records.filter(
      (x) => period === "all" || (x.performed_on >= start && x.performed_on <= end),
    );
    const totals = (rs: Workout[]): Totals => {
      const t = this.totals(rs);
      const sets = rs.flatMap((x) => x.exercises.flatMap((e) => e.sets));
      return {
        volume: t.total_volume,
        sets: t.set_count,
        days: new Set(rs.map((x) => x.performed_on)).size,
        people: new Set(rs.map((x) => x.user_id)).size,
        weight: sets.length ? Math.max(...sets.map((x) => x.weight)) : null,
        rm: sets.length ? Math.max(...sets.map((x) => x.weight * (1 + x.reps / 30))) : null,
      };
    };
    const points = selected
      .map((x) => ({ start: x.performed_on, end: x.performed_on, ...totals([x]) }))
      .sort((a, b) => a.start.localeCompare(b.start));
    return {
      window: {
        period,
        offset,
        start,
        end,
        previous_start: null,
        previous_end: null,
        can_previous: true,
      },
      exercise: q.get("exercise"),
      exercises: this.state.options.map((x) => x.name),
      totals: totals(selected),
      previous_totals: null,
      series: { day: points, week: points, month: points },
      rankings: {},
    };
  }
  private handle(p: string, q: URLSearchParams, method: string, b: Body): unknown {
    const s = this.state;
    if (p === "/me/record-snapshot" || p === "/me/record-snapshot/changes") {
      const workouts = this.all().filter((x) => x.user_id === s.userId);
      const snapshot = {
        version: 1,
        user_id: s.userId,
        workouts,
        options: s.options,
        contexts: Object.fromEntries(
          s.options.map((x) => [
            x.name,
            this.handle("/exercises/context", new URLSearchParams({ name: x.name }), "GET", {}),
          ]),
        ),
        workout_memos: Object.fromEntries(
          workouts.map((x) => [
            x.id,
            s.memos[`/workouts/${x.id}/memo`] || { content: "", revision: 0 },
          ]),
        ),
        session_exercise_memos: Object.fromEntries(
          workouts.map((x) => [
            x.id,
            Object.fromEntries(
              x.exercises.map((e) => [
                e.name,
                s.memos[`/sessions/${x.id}/exercise-memo?name=${e.name}`] || {
                  content: "",
                  revision: 0,
                },
              ]),
            ),
          ]),
        ),
      };
      return p.endsWith("/changes")
        ? {
            ...snapshot,
            deleted_workout_ids: (b.workouts || [])
              .filter((x) => !workouts.some((r) => r.id === x.id))
              .map((x) => x.id),
            deleted_option_ids: (b.options || [])
              .filter((x) => !s.options.some((o) => o.id === x.id))
              .map((x) => x.id),
            deleted_context_names: [],
            deleted_workout_memo_ids: [],
            deleted_session_exercise_memos: {},
          }
        : snapshot;
    }
    if (p === "/me" || p === "/me/profile") return { id: s.userId, display_name: s.name };
    if (p === "/me/avatar" || /^\/profiles\/.+\/avatar$/.test(p)) {
      if (method === "PUT")
        s.avatar = { version: String(++s.sequence), data_url: b.data_url || null };
      if (method === "DELETE") s.avatar = { version: null, data_url: null };
      return s.avatar;
    }
    if (p === "/notifications/settings") {
      if (method === "PUT")
        s.settings = { ...s.settings, ...b, push_stamp: false, push_start: false };
      return s.settings;
    }
    if (p === "/notifications/inbox")
      return {
        items: s.notices.filter((x) => !s.seen.includes(x.id)),
        live_start_ids: s.notices
          .filter(
            (x) =>
              x.kind === "start" &&
              Date.parse(x.live_until || "") > Date.now() &&
              s.records.some((record) => record.id === x.workout_id && record.ended_at === null),
          )
          .map((x) => x.id),
      };
    if (p === "/notifications/seen") {
      s.seen.push(...(b.ids || []));
      return null;
    }
    if (p === "/sessions/active") return s.session;
    if (p === "/sessions" && method === "POST") {
      if (s.session) return s.session;
      s.session = {
        id: b.id || `demo-session-${++s.sequence}`,
        user_id: s.userId,
        display_name: s.name,
        group_id: s.groups[0]?.id || null,
        shared_group_ids: s.groups.map((x) => x.id),
        performed_on: date(),
        created_at: new Date().toISOString(),
        started_at: b.started_at || new Date().toISOString(),
        ended_at: null,
        last_activity_at: new Date().toISOString(),
        revision: 1,
        exercises: [],
      };
      return s.session;
    }
    if (p.startsWith("/sessions/") && !p.endsWith("/exercise-memo")) {
      if (p.endsWith("/bests")) return { revision: s.session?.revision || 0, sets: [] };
      if (p.endsWith("/heartbeat")) return null;
      if (!s.session || p.split("/")[2] !== s.session.id)
        throw new ApiError("記録が見つかりません。", 404);
      if (p.endsWith("/activity")) {
        s.session.last_activity_at = new Date().toISOString();
        return s.session;
      }
      if (method === "GET") return s.session;
      if (b.expected_revision !== s.session.revision)
        throw new ApiError("保存済みを読み直してください。", 409);
      if (p.endsWith("/finish")) {
        const record = {
          ...s.session,
          revision: s.session.revision + 1,
          ended_at: new Date().toISOString(),
        };
        s.records.unshift(record);
        s.session = null;
        return record;
      }
      s.session = {
        ...s.session,
        exercises: b.exercises || s.session.exercises,
        revision: s.session.revision + 1,
        last_activity_at: new Date().toISOString(),
      };
      return s.session;
    }
    if (p === "/exercise-options") {
      if (method === "POST") {
        const option: ExerciseOption = {
          id: `demo-option-new-${++s.sequence}`,
          name: b.name?.trim() || "新しい種目",
          revision: 1,
          primary_body_part: b.primary_body_part || "other",
          secondary_body_parts: b.secondary_body_parts || [],
        };
        s.options.push(option);
        return option;
      }
      return s.options;
    }
    if (p.startsWith("/exercise-options/")) {
      const option = s.options.find((x) => x.id === p.split("/")[2]);
      if (!option) throw new ApiError("種目が見つかりません。", 404);
      if (method === "DELETE") {
        s.options = s.options.filter((x) => x !== option);
        return null;
      }
      Object.assign(option, b, { revision: (option.revision || 0) + 1 });
      return option;
    }
    if (p === "/exercises/context") {
      const prev = this.own().find((x) => x.exercises.some((e) => e.name === q.get("name")));
      return {
        best_weight: 100,
        best_rm: 126.7,
        previous: prev
          ? {
              id: prev.id,
              performed_on: prev.performed_on,
              sets: prev.exercises.find((x) => x.name === q.get("name"))?.sets || [],
            }
          : null,
        memo: s.memos[q.get("name") || ""] || { content: "", revision: 0 },
      };
    }
    if (p === "/exercises/memo" || p.endsWith("/exercise-memo") || p.endsWith("/memo")) {
      const key = p.startsWith("/sessions/")
        ? `${p}?name=${q.get("name") || ""}`
        : b.name || q.get("name") || q.get("exercise") || p;
      const old = s.memos[key] || { content: "", revision: 0 };
      if (method === "GET") return old;
      if (b.expected_revision !== undefined && b.expected_revision !== old.revision)
        throw new ApiError("保存済みを読み直してください。", 409);
      s.memos[key] = { content: b.content || "", revision: old.revision + 1 };
      return s.memos[key];
    }
    if (p === "/groups/today-activity") {
      const groups = s.groups.map((x) => this.activity(x));
      return {
        groups,
        totals: groups.reduce(
          (a, x) => ({
            set_count: a.set_count + x.totals.set_count,
            total_volume: a.total_volume + x.totals.total_volume,
          }),
          { set_count: 0, total_volume: 0 },
        ),
      };
    }
    if (p === "/groups") {
      if (method === "POST") {
        const g = {
          id: `demo-group-${++s.sequence}`,
          name: b.name || "新しいグループ",
          owner_id: s.userId,
          invite_code: "DEMOONLY",
        };
        s.groups.push(g);
        return g;
      }
      return s.groups;
    }
    if (p === "/group-invites/preview" || p === "/groups/preview")
      return { ...s.groups[0], member_count: 13, already_member: true };
    if (p === "/group-invites/join" || p === "/groups/join") return s.groups[0];
    if (p.endsWith("/stamps/summary"))
      return Object.fromEntries(
        (b.workout_ids || []).map((id) => [
          id,
          s.stamps[id] || {
            counts: { encourage: 3, amazing: 2 },
            mine: [],
            can_send: !this.own().some((x) => x.id === id),
          },
        ]),
      );
    if (p === "/stamps/seen") {
      s.read ||= [];
      s.read.push(...(b.ids || []));
      return null;
    }
    if (p === "/stamps/inbox") {
      const notices = s.notices.filter(
        (x) => x.kind === "stamp" && (!q.get("workout_id") || x.workout_id === q.get("workout_id")),
      );
      const counts: Record<string, number> = {};
      for (const x of notices)
        if (x.stamp_kind) counts[x.stamp_kind] = (counts[x.stamp_kind] || 0) + 1;
      const offset = Number(q.get("offset") || 0);
      return {
        counts,
        items: notices.slice(offset, offset + 50).map((x) => {
          const record = this.all().find((r) => r.id === x.workout_id);
          return {
            ...x,
            group_id: s.groups[0]?.id || "demo-ezofrogs",
            group_name: s.groups[0]?.name || "ezofrogs",
            kind: x.stamp_kind,
            performed_on: record?.performed_on || date(),
            exercise: record?.exercises[0]?.name || "ベンチプレス",
            read: s.read?.includes(x.id) || false,
            announced: s.seen.includes(x.id),
            mine: false,
          };
        }),
        total: notices.length,
        people: new Set(notices.map((x) => x.sender_id)).size,
        unread: notices.filter((x) => !s.read?.includes(x.id)).length,
        mine: [],
        can_send: false,
        has_more: notices.length > offset + 50,
      };
    }
    if (p.includes("/stamps")) {
      const id = p.split("/")[4];
      if (method !== "GET" && id) {
        s.stamps[id] ||= {
          counts: { encourage: 3, amazing: 2 },
          mine: [],
          can_send: true,
        };
        const v = s.stamps[id];
        const kind = b.kind || p.split("/").at(-1) || "encourage";
        if (method === "DELETE") {
          v.mine = v.mine.filter((x) => x !== kind);
          v.counts[kind] = Math.max(0, (v.counts[kind] || 0) - 1);
        } else if (!v.mine.includes(kind)) {
          v.mine.push(kind);
          v.counts[kind] = (v.counts[kind] || 0) + 1;
        }
        return v;
      }
      return {
        items: [],
        counts: {},
        mine: [],
        can_send: true,
        total: 0,
        people: 0,
        unread: 0,
        has_more: false,
      };
    }
    const g = p.startsWith("/groups/") ? s.groups.find((x) => x.id === p.split("/")[2]) : null;
    if (g) {
      if (p === `/groups/${g.id}/activity`) return this.activity(g);
      if (p.endsWith("/invites"))
        return { token: "demo-invite", expires_at: new Date(Date.now() + 86400000).toISOString() };
      if (p.endsWith("/owner")) {
        g.owner_id = b.member_id || g.owner_id;
        return g;
      }
      if (p.endsWith("/membership") || (method === "DELETE" && p === `/groups/${g.id}`)) {
        s.groups = s.groups.filter((x) => x !== g);
        return null;
      }
      if (p === `/groups/${g.id}`) {
        if (method === "PATCH") {
          g.name = b.name || g.name;
          return g;
        }
        return {
          ...g,
          members: this.activity(g).members.map((x) => ({
            ...x,
            joined_at: `${date(-30)}T00:00:00Z`,
          })),
        };
      }
      if (p.includes("/members/") && method === "DELETE") return null;
    }
    const records = g ? this.all().filter((x) => x.shared_group_ids?.includes(g.id)) : this.own();
    if (p.endsWith("/analytics")) return this.analytics(records, q);
    if (p.endsWith("/workouts/activity")) {
      const selected = records.filter((x) =>
        x.performed_on.startsWith(q.get("month") || date().slice(0, 7)),
      );
      const days = [...new Set(selected.map((x) => x.performed_on))].map((day) => {
        const rs = selected.filter((x) => x.performed_on === day);
        const t = this.totals(rs);
        return {
          date: day,
          volume: t.total_volume,
          set_count: t.set_count,
          workout_count: rs.length,
          body_parts: rs.flatMap((x) =>
            x.exercises.map((e) => ({
              body_part: s.options.find((x) => x.name === e.name)?.primary_body_part || "other",
              volume: e.sets.reduce((a, x) => a + x.weight * x.reps, 0),
              set_count: e.sets.length,
              workout_count: 1,
            })),
          ),
          workout_groups: rs.map((x) => ({
            body_parts: x.exercises.map(
              (e) => s.options.find((x) => x.name === e.name)?.primary_body_part || "other",
            ),
            workout_count: 1,
          })),
        };
      });
      const t = this.totals(selected);
      return {
        month: q.get("month"),
        metric: "volume",
        total_volume: t.total_volume,
        total_sets: t.set_count,
        workout_count: selected.length,
        active_days: days.length,
        days,
      };
    }
    if (p === "/history/summary") {
      const rs = this.own();
      const t = this.totals(rs);
      return {
        workout_count: rs.length,
        total_sets: t.set_count,
        total_volume: t.total_volume,
        first_performed_on: rs.at(-1)?.performed_on || null,
        exercises: s.options.map((x) => ({
          name: x.name,
          body_part: x.primary_body_part,
          last_performed_on: x.last_performed_on || date(),
        })),
      };
    }
    if (p.endsWith("/workouts")) {
      if (method === "POST") {
        const r: Workout = {
          id: `demo-record-${++s.sequence}`,
          user_id: s.userId,
          display_name: s.name,
          group_id: null,
          shared_group_ids: b.shared_group_ids || [],
          performed_on: b.performed_on || date(),
          exercises: b.exercises || [],
          revision: 1,
          created_at: new Date().toISOString(),
        };
        s.records.unshift(r);
        return r;
      }
      const offset = Number(q.get("offset") || 0);
      return records
        .filter(
          (x) =>
            (!q.get("performed_on") || x.performed_on === q.get("performed_on")) &&
            (!q.get("start") || x.performed_on >= (q.get("start") || "")) &&
            (!q.get("end") || x.performed_on <= (q.get("end") || "")),
        )
        .slice(offset, offset + 50);
    }
    if (p.includes("/workouts/")) {
      const id = p.slice(p.indexOf("/workouts/") + 10).split("/")[0];
      const r = this.all().find((x) => x.id === id);
      if (!r) throw new ApiError("記録が見つかりません。", 404);
      if (p.includes("/score")) return null;
      if (method === "DELETE") {
        s.records = s.records.filter((x) => x.id !== id);
        return null;
      }
      if (method === "PATCH" || method === "PUT") {
        Object.assign(r, b, { revision: r.revision + 1 });
        return r;
      }
      return r;
    }
    if (p === "/suggestions") return { id: `demo-suggestion-${++s.sequence}` };
    throw new ApiError("この操作はデモでは利用できません。", 404);
  }
}
