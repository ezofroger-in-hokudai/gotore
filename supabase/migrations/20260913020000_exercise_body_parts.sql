-- 本人の種目分類だけを追加し、履歴JSONと共有範囲は変更しない。
ALTER TABLE public.gotore_exercise_options
    ADD COLUMN primary_body_part text,
    ADD COLUMN secondary_body_parts text[] NOT NULL DEFAULT '{}',
    ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    ADD CONSTRAINT gotore_exercise_primary_part CHECK
        (primary_body_part IS NULL OR primary_body_part = ANY(ARRAY['chest', 'back', 'shoulders', 'arms', 'legs', 'glutes', 'abs', 'full_body', 'other']::text[])),
    ADD CONSTRAINT gotore_exercise_secondary_parts CHECK (
        secondary_body_parts <@ ARRAY['chest', 'back', 'shoulders', 'arms', 'legs', 'glutes', 'abs', 'full_body', 'other']::text[]
        AND cardinality(secondary_body_parts) <= 8
        AND array_position(secondary_body_parts, NULL) IS NULL
        AND (cardinality(secondary_body_parts) = 0 OR primary_body_part IS NOT NULL)
        AND (primary_body_part IS NULL OR NOT primary_body_part = ANY(secondary_body_parts))
        AND coalesce(array_length(array_positions(secondary_body_parts, 'chest'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'back'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'shoulders'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'arms'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'legs'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'glutes'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'abs'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'full_body'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'other'), 1), 0) <= 1
    );

UPDATE public.gotore_exercise_options SET primary_body_part = 'chest',
    secondary_body_parts = ARRAY['shoulders', 'arms'] WHERE name = 'ベンチプレス';
UPDATE public.gotore_exercise_options SET primary_body_part = 'legs',
    secondary_body_parts = ARRAY['glutes'] WHERE name = 'スクワット';
UPDATE public.gotore_exercise_options SET primary_body_part = 'glutes',
    secondary_body_parts = ARRAY['back', 'legs'] WHERE name = 'デッドリフト';
UPDATE public.gotore_exercise_options SET primary_body_part = 'chest',
    secondary_body_parts = ARRAY['shoulders'] WHERE name = 'ペックフライ';
UPDATE public.gotore_exercise_options SET primary_body_part = 'back',
    secondary_body_parts = ARRAY['arms'] WHERE name = 'ラットプルダウン';
UPDATE public.gotore_exercise_options SET primary_body_part = 'shoulders',
    secondary_body_parts = ARRAY['arms'] WHERE name = 'ショルダープレス';
UPDATE public.gotore_exercise_options SET primary_body_part = 'back',
    secondary_body_parts = ARRAY['arms'] WHERE name = '懸垂';
UPDATE public.gotore_exercise_options SET primary_body_part = 'chest',
    secondary_body_parts = ARRAY['shoulders', 'arms'] WHERE name = '腕立て伏せ';
