import { type AvatarImage, api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { useResource } from "../training/use-resource";
import { prepareAvatar } from "./avatar-image";

export function AvatarPanel({
  name,
  onSaved,
  onClose,
}: {
  name: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const current = useResource<AvatarImage>("/me/avatar");
  const [selected, setSelected] = useState<{ blob: Blob; url: string } | null>(null);
  const [saved, setSaved] = useState<AvatarImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (selected) URL.revokeObjectURL(selected.url);
    },
    [selected],
  );
  const image = saved ?? current.data;
  const src = selected?.url ?? image?.data_url;
  async function save(remove = false) {
    if (busy || (!remove && !selected)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<AvatarImage>("/me/avatar", {
        method: remove ? "DELETE" : "PUT",
        ...(remove
          ? {}
          : {
              body: selected?.blob,
              headers: { "Content-Type": "image/jpeg" },
            }),
      });
      if (mounted.current) {
        setSaved(remove ? { version: null, data_url: null } : result);
        setSelected(null);
        setMessage(remove ? "画像を削除しました。" : "保存しました。");
      }
      onSaved();
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : "保存できません。");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="avatar-editor" aria-busy={busy}>
      <div className="avatar-preview" role="img" aria-label="プロフィール画像のプレビュー">
        {src ? (
          <img src={src} alt="" width={256} height={256} />
        ) : (
          <span>{Array.from(name)[0]}</span>
        )}
      </div>
      <p className="muted">同じグループのメンバーに表示されます。</p>
      <button
        className="secondary full"
        type="button"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        写真を選ぶ
      </button>
      <input
        ref={fileInput}
        hidden
        aria-label="写真を選ぶ"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true);
          setError("");
          setMessage("");
          try {
            const blob = await prepareAvatar(file);
            if (mounted.current) setSelected({ blob, url: URL.createObjectURL(blob) });
          } catch (reason) {
            if (mounted.current)
              setError(reason instanceof Error ? reason.message : "画像を読み込めません。");
          } finally {
            if (mounted.current) setBusy(false);
          }
        }}
      />
      <p className="muted avatar-file-hint">JPEG・PNG・WebP / 10MBまで</p>
      {current.loading && !image && <output>読み込み中…</output>}
      {current.error && !saved && (
        <p className="error" role="alert">
          {current.error}
          <button type="button" className="text-button" onClick={current.retry}>
            再試行
          </button>
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <output className="avatar-save-status">{message}</output>
      <button
        className="primary full"
        type="button"
        disabled={busy || !selected}
        onClick={() => void save()}
      >
        {busy ? "処理中…" : "保存"}
      </button>
      {selected ? (
        <button
          className="secondary full"
          type="button"
          disabled={busy}
          onClick={() => {
            setSelected(null);
            setError("");
          }}
        >
          選択を取り消す
        </button>
      ) : (
        image?.version && (
          <button
            className="text-button full"
            type="button"
            disabled={busy}
            onClick={() => void save(true)}
          >
            画像を削除
          </button>
        )
      )}
      <button className="text-button full" type="button" disabled={busy} onClick={onClose}>
        戻る
      </button>
    </div>
  );
}
