import { api } from "@/lib/api";
import { isDemoMode } from "../demo/mode";
export async function notificationRegistration() {
  if (
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error(
      "この環境では端末通知を利用できません。iPhoneではホーム画面に追加して開いてください。",
    );
  return navigator.serviceWorker.register("/notification-worker.js", { scope: "/" });
}
export async function enablePush() {
  if (isDemoMode()) throw new Error("デモでは端末通知を利用しません。");
  if (!("Notification" in window))
    throw new Error(
      "iPhoneはホーム画面に追加して開いてください。このブラウザでは端末通知を利用できません。",
    );
  // 許可要求は利用者が押したボタンから直接呼び、読み込み時には出さない。
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("通知が許可されていません。端末・ブラウザの設定を確認してください。");
  const key = await api<{ public_key: string }>("/notifications/push-key");
  if (!key.public_key) throw new Error("端末通知の配信設定がまだありません。");
  await notificationRegistration();
  const registration = await navigator.serviceWorker.ready;
  const raw = atob(key.public_key.replace(/-/g, "+").replace(/_/g, "/"));
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
    }));
  return api<{ id: string }>("/notifications/subscription", {
    method: "PUT",
    body: JSON.stringify(subscription.toJSON()),
  });
}
export async function restorePush() {
  if (isDemoMode()) return null;
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !("serviceWorker" in navigator)
  )
    return null;
  const registration = await notificationRegistration();
  const subscription = await registration.pushManager.getSubscription();
  return subscription
    ? api<{ id: string }>("/notifications/subscription", {
        method: "PUT",
        body: JSON.stringify(subscription.toJSON()),
      })
    : null;
}
export async function disablePush() {
  if (isDemoMode()) return;
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api("/notifications/subscription", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
  const cards = await registration?.getNotifications();
  for (const card of cards || []) card.close();
}
let soundContext: AudioContext | null = null;
export function unlockNotificationSound() {
  if (typeof AudioContext !== "undefined") {
    soundContext ??= new AudioContext();
    void soundContext.resume().catch(() => {});
  }
}
export function notificationFeedback(vibration: boolean, sound: boolean) {
  if (vibration) navigator.vibrate?.(35);
  if (sound && soundContext?.state === "running") {
    const oscillator = soundContext.createOscillator();
    const gain = soundContext.createGain();
    oscillator.connect(gain);
    gain.connect(soundContext.destination);
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.025, soundContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, soundContext.currentTime + 0.08);
    oscillator.start();
    oscillator.stop(soundContext.currentTime + 0.08);
  }
}
