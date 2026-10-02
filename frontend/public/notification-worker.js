self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const data = event.data?.json();
      if (!data || !["stamp", "start"].includes(data.kind)) return;
      const tag = `egotore-${data.kind}`;
      const count = Math.max(1, Number(data.count) || 1);
      await self.registration.showNotification(
        data.kind === "stamp" ? "誰かからスタンプが届きました" : "誰かがトレーニングを開始しました",
        {
          body:
            data.kind === "stamp"
              ? `${count}件のスタンプ・開いて確認`
              : `${count}人がトレーニング中`,
          tag,
          renotify: false,
          icon: "/app-icons/192?v=wombat-a",
          badge: "/app-icons/192?v=wombat-a",
          data: { url: "/?notification=home" },
        },
      );
      for (const client of await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      }))
        client.postMessage({ type: "activity-notification" });
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = windows.find((x) => new URL(x.url).origin === self.location.origin);
      if (client) {
        client.postMessage({ type: "notification-home" });
        await client.focus();
      } else await self.clients.openWindow("/?notification=home");
    })(),
  );
});
