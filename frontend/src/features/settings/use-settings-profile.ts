import type { AvatarImage } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { useResource } from "../training/use-resource";

export type Profile = { display_name: string };

export function useSettingsProfile(active: boolean) {
  const [opened, setOpened] = useState(false);
  const [version, setVersion] = useState(0);
  const lastRequested = useRef<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const now = Date.now();
    if (lastRequested.current === null || now - lastRequested.current >= 60_000) {
      if (lastRequested.current !== null) setVersion((value) => value + 1);
      lastRequested.current = now;
    }
    setOpened(true);
  }, [active]);
  // Workspaceのユーザー単位で保持し、フォームの開閉では要求を増やさない。
  const options = { enabled: opened, retainOnRefresh: true };
  const profile = useResource<Profile>("/me", version, false, false, options);
  const avatar = useResource<AvatarImage>("/me/avatar", version, false, false, options);
  return { profile, avatar };
}

export type SettingsProfile = ReturnType<typeof useSettingsProfile>;
