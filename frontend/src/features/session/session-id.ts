type RandomUuid = (() => string) | null | undefined;

// HTTPで開く同一Wi-Fi上の実機ではrandomUUIDが使えないため、UUID形式を維持して代替する。
export function createSessionId(
  randomUuid: RandomUuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto),
  random: () => number = Math.random,
) {
  if (randomUuid) return randomUuid();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}
