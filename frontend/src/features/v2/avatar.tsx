import { type AvatarImage, api } from "@/lib/api";
import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from "react";

type ImageCache = Map<string, { pending: Promise<AvatarImage>; savedAt: number }>;
const Avatars = createContext<ImageCache | null>(null);

export function AvatarProvider({ children }: { children: ReactNode }) {
  // ログイン中のWorkspace内だけで共有し、別アカウント・永続ストレージへ持ち越さない。
  const cache = useRef<ImageCache>(new Map());
  return <Avatars.Provider value={cache.current}>{children}</Avatars.Provider>;
}

export function Avatar({
  userId,
  name,
  version,
  live = false,
  small = false,
}: {
  userId: string;
  name: string;
  version?: string | null;
  live?: boolean;
  small?: boolean;
}) {
  const cache = useContext(Avatars);
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const key = `${userId}:${version}`;
  useEffect(() => {
    if (!version || !cache) return;
    let stopped = false;
    let entry = cache.get(key);
    if (!entry || Date.now() - entry.savedAt > 60_000) {
      entry = {
        pending: api<AvatarImage>(`/profiles/${userId}/avatar`),
        savedAt: Date.now(),
      };
      cache.set(key, entry);
      if (cache.size > 64) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
    }
    void entry.pending
      .then((result) => {
        if (!stopped && result.version === version && result.data_url) {
          setImage({ key, url: result.data_url });
        }
      })
      .catch(() => {
        cache.delete(key);
        if (!stopped) setImage(null);
      });
    return () => {
      stopped = true;
    };
  }, [cache, key, userId, version]);
  return (
    <span
      className={`person-avatar${small ? " avatar-small" : ""}${live ? " is-live" : ""}`}
      role="img"
      aria-label={`${name}${live ? "・トレーニング中" : ""}`}
      title={name}
    >
      {image?.key === key ? (
        <img src={image.url} alt="" width={256} height={256} onError={() => setImage(null)} />
      ) : (
        <span className="avatar-initial" aria-hidden="true">
          {Array.from(name)[0]}
        </span>
      )}
      {live && <span className="avatar-live-dot" aria-hidden="true" />}
    </span>
  );
}
