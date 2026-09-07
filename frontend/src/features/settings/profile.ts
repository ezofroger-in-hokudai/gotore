type ProfileActions = {
  updateAuth: (name: string) => Promise<void>;
  syncProfile: () => Promise<void>;
};

export async function saveDisplayName(value: string, actions: ProfileActions) {
  const name = value.trim();
  if (!name || Array.from(name).length > 20)
    throw new Error("表示名は1〜20文字で入力してください。");
  try {
    await actions.updateAuth(name);
  } catch {
    throw new Error("表示名を変更できませんでした。接続を確認して再試行してください。");
  }
  try {
    await actions.syncProfile();
    return { name, synced: true };
  } catch {
    // AuthとDBは別通信。更新済みの表示名を未変更として案内しない。
    return { name, synced: false };
  }
}
