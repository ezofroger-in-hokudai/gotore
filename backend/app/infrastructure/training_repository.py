import secrets
from uuid import UUID

from psycopg import Connection
from psycopg.types.json import Jsonb

from app.domain.errors import Conflict, NotFound
from app.domain.identity import AuthenticatedUser, User
from app.domain.workout import WorkoutInput, WorkoutUpdate


class TrainingRepository:
    def __init__(self, connection: Connection):
        self.connection = connection

    def profile(self, user: AuthenticatedUser) -> User:
        # 既定値は新規作成時だけ補い、Auth未設定なら保存済みの名前に触れない。
        result = self.connection.execute(
            """INSERT INTO public.gotore_profiles (id, display_name)
            VALUES (%s, COALESCE(%s, 'トレーニー'))
            ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name
            WHERE %s::text IS NOT NULL
              AND gotore_profiles.display_name != EXCLUDED.display_name
            RETURNING id, display_name""",
            (user.id, user.display_name, user.display_name),
        ).fetchone()
        if result is None:
            result = self.connection.execute(
                "SELECT id, display_name FROM public.gotore_profiles WHERE id = %s", (user.id,)
            ).fetchone()
        return User.model_validate(result)

    def groups(self, user_id: UUID):
        return self.connection.execute(
            """SELECT g.* FROM public.gotore_groups g
            JOIN public.gotore_group_members m ON m.group_id = g.id
            WHERE m.user_id = %s ORDER BY g.created_at DESC, g.id""",
            (user_id,),
        ).fetchall()

    def group(self, user_id: UUID, group_id: UUID):
        result = self.connection.execute(
            """SELECT g.* FROM public.gotore_groups g
            JOIN public.gotore_group_members m ON m.group_id = g.id
            WHERE m.user_id = %s AND g.id = %s""",
            (user_id, group_id),
        ).fetchone()
        if result is None:
            raise NotFound("グループが見つからないか、参加していません")
        return result

    def members(self, group_id: UUID):
        return self.connection.execute(
            """SELECT p.id, p.display_name FROM public.gotore_profiles p
            JOIN public.gotore_group_members m ON m.user_id = p.id
            WHERE m.group_id = %s ORDER BY m.joined_at, p.id""",
            (group_id,),
        ).fetchall()

    def create_group(self, user_id: UUID, name: str):
        # グループだけが残らないよう、作成者の参加までを一度に確定する。
        with self.connection.transaction():
            group = self.connection.execute(
                """INSERT INTO public.gotore_groups (name, owner_id, invite_code)
                VALUES (%s, %s, %s) RETURNING *""",
                (name, user_id, secrets.token_hex(6).upper()),
            ).fetchone()
            self.connection.execute(
                "INSERT INTO public.gotore_group_members (group_id, user_id) VALUES (%s, %s)",
                (group["id"], user_id),
            )
        return group

    def join_group(self, user_id: UUID, invite_code: str):
        with self.connection.transaction():
            group = self.connection.execute(
                "SELECT * FROM public.gotore_groups WHERE invite_code = %s", (invite_code,)
            ).fetchone()
            if group is None:
                raise NotFound("招待コードに対応するグループが見つかりません")
            self.connection.execute(
                """INSERT INTO public.gotore_group_members (group_id, user_id) VALUES (%s, %s)
                ON CONFLICT (group_id, user_id) DO NOTHING""",
                (group["id"], user_id),
            )
        return group

    def rename_group(self, user_id: UUID, group_id: UUID, name: str):
        group = self.connection.execute(
            """UPDATE public.gotore_groups SET name = %s
            WHERE id = %s AND owner_id = %s RETURNING *""",
            (name, group_id, user_id),
        ).fetchone()
        if group is None:
            raise NotFound("グループが見つからないか、変更する権限がありません")
        return group

    def save_workout(self, user_id: UUID, workout: WorkoutInput):
        exercises = workout.model_dump(mode="json")["exercises"]
        with self.connection.transaction():
            self.lock_workout(workout.id)
            if self.connection.execute(
                "SELECT id FROM public.gotore_deleted_workouts WHERE id = %s", (workout.id,)
            ).fetchone():
                raise Conflict("この記録は削除済みです。新しい記録として入力してください")
            if workout.group_id is not None:
                self.group(user_id, workout.group_id)
            self.connection.execute(
                """INSERT INTO public.gotore_workouts
                (id, user_id, group_id, performed_on, exercises) VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING""",
                (workout.id, user_id, workout.group_id, workout.performed_on, Jsonb(exercises)),
            )
            row = self.connection.execute(
                """SELECT w.*, p.display_name FROM public.gotore_workouts w
                JOIN public.gotore_profiles p ON p.id = w.user_id WHERE w.id = %s""",
                (workout.id,),
            ).fetchone()
            # 同じ送信IDの再試行だけを許し、他人のIDや異なる内容で上書きしない。
            if (
                row["user_id"] != user_id
                or row["group_id"] != workout.group_id
                or row["performed_on"] != workout.performed_on
                or row["exercises"] != exercises
            ):
                raise Conflict("同じ保存IDで異なる記録が送信されました。記録一覧を確認してください")
        return row

    def workouts(self, user_id: UUID, group_id: UUID | None, limit: int, offset: int):
        if group_id is not None:
            self.group(user_id, group_id)
            where, value = "w.group_id = %s", group_id
            order = "w.created_at DESC, w.id"
        else:
            where, value = "w.user_id = %s", user_id
            order = "w.performed_on DESC, w.created_at DESC, w.id"
        return self.connection.execute(
            f"""SELECT w.*, p.display_name FROM public.gotore_workouts w
            JOIN public.gotore_profiles p ON p.id = w.user_id
            WHERE {where} ORDER BY {order} LIMIT %s OFFSET %s""",
            (value, limit, offset),
        ).fetchall()

    def lock_workout(self, workout_id: UUID):
        # 行がまだない作成要求も、削除・編集と同じIDで順序付ける。
        self.connection.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (str(workout_id),)
        )

    def owned_workout(self, user_id: UUID, workout_id: UUID):
        return self.connection.execute(
            """SELECT w.*, p.display_name FROM public.gotore_workouts w
            JOIN public.gotore_profiles p ON p.id = w.user_id
            WHERE w.id = %s AND w.user_id = %s FOR UPDATE OF w""",
            (workout_id, user_id),
        ).fetchone()

    def update_workout(self, user_id: UUID, workout_id: UUID, workout: WorkoutUpdate):
        exercises = workout.model_dump(mode="json")["exercises"]
        with self.connection.transaction():
            self.lock_workout(workout_id)
            record = self.owned_workout(user_id, workout_id)
            if record is None:
                raise NotFound("記録が見つからないか、操作する権限がありません")
            unchanged = (
                record["performed_on"] == workout.performed_on and record["exercises"] == exercises
            )
            if record["revision"] != workout.expected_revision:
                if record["revision"] == workout.expected_revision + 1 and unchanged:
                    return record
                raise Conflict(
                    "記録は別の操作で変更されています。一覧に戻って最新の内容を確認してください"
                )
            if unchanged:
                return record
            self.connection.execute(
                """UPDATE public.gotore_workouts SET performed_on = %s, exercises = %s,
                revision = revision + 1 WHERE id = %s""",
                (workout.performed_on, Jsonb(exercises), workout_id),
            )
            return self.owned_workout(user_id, workout_id)

    def delete_workout(self, user_id: UUID, workout_id: UUID, expected_revision: int):
        with self.connection.transaction():
            self.lock_workout(workout_id)
            record = self.owned_workout(user_id, workout_id)
            if record is None:
                deleted = self.connection.execute(
                    "SELECT id FROM public.gotore_deleted_workouts WHERE id = %s AND user_id = %s",
                    (workout_id, user_id),
                ).fetchone()
                if deleted:
                    return
                raise NotFound("記録が見つからないか、操作する権限がありません")
            if record["revision"] != expected_revision:
                raise Conflict(
                    "記録は別の操作で変更されています。一覧に戻って最新の内容を確認してください"
                )
            self.connection.execute(
                "INSERT INTO public.gotore_deleted_workouts (id, user_id) VALUES (%s, %s)",
                (workout_id, user_id),
            )
            self.connection.execute(
                "DELETE FROM public.gotore_workouts WHERE id = %s", (workout_id,)
            )
