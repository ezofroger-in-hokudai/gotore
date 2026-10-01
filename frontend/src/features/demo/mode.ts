export function isDemoPath(path: string) {
  return path === "/demo" || path === "/demo/";
}
export function isDemoMode() {
  return typeof window !== "undefined" && isDemoPath(window.location.pathname);
}
