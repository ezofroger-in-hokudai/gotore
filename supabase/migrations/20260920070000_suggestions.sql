CREATE TABLE public.gotore_suggestions (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    id uuid NOT NULL,
    display_name text NOT NULL,
    content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'resolved')),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX gotore_suggestions_user_created_idx
    ON public.gotore_suggestions (user_id, created_at DESC);
CREATE INDEX gotore_suggestions_created_idx ON public.gotore_suggestions (created_at DESC);

-- 投稿は認証済みAPIだけから受け付け、閲覧は運営のDB管理画面に限定する。
ALTER TABLE public.gotore_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gotore_suggestions FROM PUBLIC, anon, authenticated;
