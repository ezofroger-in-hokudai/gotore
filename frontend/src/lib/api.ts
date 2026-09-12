import { getSupabase } from "./supabase";

export type MonthlyActivity = {
  month: string;
  metric: "score";
  best_score: number | null;
  total_sets: number;
  workout_count: number;
  active_days: number;
  days: { date: string; score: number | null; set_count: number; workout_count: number }[];
};

export type Group = {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
};
export type GroupDetail = Group & {
  members: { id: string; display_name: string; joined_at: string }[];
};
export type ExerciseOption = { id: string; name: string };
export type Exercise = {
  name: string;
  sets: { weight: number; reps: number }[];
};
export type Workout = {
  score?: ScoreSummary | null;
  id: string;
  user_id: string;
  display_name: string;
  group_id: string | null;
  performed_on: string;
  exercises: Exercise[];
  created_at: string;
  revision: number;
  started_at?: string | null;
  ended_at?: string | null;
  shared_group_ids?: string[];
};

export type TrainingSession = Workout & {
  started_at: string;
  ended_at: string | null;
  best_updated?: boolean;
};
export type ExerciseContext = {
  best_weight: number | null;
  best_rm: number | null;
  previous: { id: string; performed_on: string; sets: Exercise["sets"] } | null;
  memo: { content: string; revision: number };
};
export type SessionBests = {
  revision: number;
  sets: { exercise_index: number; set_index: number }[];
};
export type AvatarImage = { version: string | null; data_url: string | null };
export type GroupSummary = {
  observed_at?: string;
  group_id: string;
  member_count: number;
  live_count: number;
  today_count: number;
  members: {
    id: string;
    display_name: string;
    live: boolean;
    today: boolean;
    live_until?: string | null;
    avatar_version?: string | null;
  }[];
};
export type GroupActivity = GroupSummary & {
  feed: {
    score?: ScoreSummary | null;
    workout_id: string;
    user_id: string;
    display_name: string;
    exercise: string;
    weight: number;
    reps: number;
    estimated_rm: number | null;
    updated_at: string;
    best: boolean;
  }[];
};

export type ScoreAxis = "c" | "i" | "v" | "g";
export type ScoreWeights = Record<ScoreAxis, number>;
export type TrainingGoal = {
  id: string;
  version: number;
  body: string;
  is_standard: boolean;
  criteria: { text: string; observation_days: number }[];
  created_at: string;
};
export type ScoreSummary = {
  initial_axes?: Exclude<ScoreAxis, "g">[];
  workout_id: string;
  revision: number;
  total: number | null;
  components: Record<ScoreAxis, number | null>;
  status: "pending" | "processing" | "complete" | "stale";
  weights: ScoreWeights;
  weights_version: number;
  scored_at: string;
};
export type ScoreDetail = ScoreSummary & {
  goal: TrainingGoal;
  baseline: { id: string; performed_on: string; revision: number } | null;
  comment: string | null;
  judgments: { rating: number | null; reason: string }[];
  formula_version: string;
  model: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const client = getSupabase();
  if (!client) throw new Error("ログインを利用できません。");
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error("ログインし直してください。");
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
        ...options.headers,
      },
    });
  } catch {
    throw new Error("通信できませんでした。再試行してください。");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body?.detail === "string" ? body.detail : null;
    throw new ApiError(
      message ??
        (response.status === 422
          ? "入力を確認してください。"
          : "取得できません。再試行してください。"),
      response.status,
    );
  }
  return body as T;
}
