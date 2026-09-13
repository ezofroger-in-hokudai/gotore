-- 現在の分類を8部位に統一する。履歴本文・所有者・候補のIDは維持する。
ALTER TABLE public.gotore_exercise_options
    DROP CONSTRAINT gotore_exercise_primary_part,
    DROP CONSTRAINT gotore_exercise_secondary_parts;

WITH normalized AS (
    SELECT id, COALESCE(NULLIF(primary_body_part, 'full_body'), 'other') AS primary_part,
        ARRAY(
            SELECT part FROM (
                SELECT DISTINCT CASE WHEN old_part = 'full_body' THEN 'other' ELSE old_part END AS part
                FROM unnest(secondary_body_parts) AS old_part
            ) parts
            WHERE part <> COALESCE(NULLIF(primary_body_part, 'full_body'), 'other')
            ORDER BY array_position(ARRAY['chest','back','legs','arms','shoulders','abs','glutes','other'], part)
        ) AS secondary_parts
    FROM public.gotore_exercise_options
)
UPDATE public.gotore_exercise_options o
SET primary_body_part = n.primary_part, secondary_body_parts = n.secondary_parts,
    revision = o.revision + 1
FROM normalized n
WHERE o.id = n.id AND (o.primary_body_part IS DISTINCT FROM n.primary_part
    OR o.secondary_body_parts IS DISTINCT FROM n.secondary_parts);

ALTER TABLE public.gotore_exercise_options
    ALTER COLUMN primary_body_part SET DEFAULT 'other',
    ALTER COLUMN primary_body_part SET NOT NULL,
    ADD CONSTRAINT gotore_exercise_primary_part CHECK
        (primary_body_part = ANY(ARRAY['chest','back','legs','arms','shoulders','abs','glutes','other']::text[])),
    ADD CONSTRAINT gotore_exercise_secondary_parts CHECK (
        secondary_body_parts <@ ARRAY['chest','back','legs','arms','shoulders','abs','glutes','other']::text[]
        AND cardinality(secondary_body_parts) <= 7
        AND array_position(secondary_body_parts, NULL) IS NULL
        AND NOT primary_body_part = ANY(secondary_body_parts)
        AND coalesce(array_length(array_positions(secondary_body_parts, 'chest'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'back'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'legs'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'arms'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'shoulders'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'abs'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'glutes'), 1), 0) <= 1
        AND coalesce(array_length(array_positions(secondary_body_parts, 'other'), 1), 0) <= 1
    );
