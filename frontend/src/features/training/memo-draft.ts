export type Memo = { content: string; revision: number };
export type MemoDraftState = "saved" | "stored" | "memory";

export function memoDraftKey(userId: string, target: string) {
  return `gotore:memo-input:v1:${userId}:${target}`;
}

export function readMemoDraft(key: string): Memo | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value &&
      typeof value.content === "string" &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0
      ? { content: value.content, revision: value.revision }
      : null;
  } catch {
    return null;
  }
}

export function removeMemoDraft(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
