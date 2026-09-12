export function canRetainResource(reason: unknown): boolean {
  const status =
    reason && typeof reason === "object" && "status" in reason ? Number(reason.status) : 0;
  return !status || status >= 500 || status === 408 || status === 429;
}
