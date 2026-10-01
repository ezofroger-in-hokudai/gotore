import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function worker() {
  const handlers = new Map<string, (e: unknown) => void>();
  const shown: { title: string; options: { tag: string; body: string; data: { url: string } } }[] =
    [];
  const messages: unknown[] = [];
  let opened = "";
  let focused = false;
  const client = {
    url: "https://egotore.com/",
    postMessage: (x: unknown) => messages.push(x),
    focus: async () => {
      focused = true;
    },
  };
  let clients: (typeof client)[] = [client];
  runInNewContext(
    readFileSync(new URL("../../public/notification-worker.js", import.meta.url), "utf8"),
    {
      URL,
      self: {
        addEventListener: (type: string, fn: (e: unknown) => void) => handlers.set(type, fn),
        location: { origin: "https://egotore.com" },
        registration: {
          showNotification: async (title: string, options: (typeof shown)[number]["options"]) => {
            const i = shown.findIndex((x) => x.options.tag === options.tag);
            if (i >= 0) shown.splice(i, 1);
            shown.push({ title, options });
          },
        },
        clients: {
          matchAll: async () => clients,
          openWindow: async (url: string) => {
            opened = url;
          },
        },
      },
    },
  );
  async function send(type: string, data: unknown) {
    let work: Promise<void> | undefined;
    handlers.get(type)?.({
      ...(data as object),
      waitUntil: (p: Promise<void>) => {
        work = p;
      },
    });
    await work;
  }
  return {
    shown,
    messages,
    send,
    empty: () => {
      clients = [];
    },
    opened: () => opened,
    focused: () => focused,
  };
}
test("OS通知は種類ごと一枚、匿名文言を維持して件数を更新する", async () => {
  const w = worker();
  for (let i = 1; i <= 12; i++)
    await w.send("push", { data: { json: () => ({ kind: "stamp", count: i }) } });
  await w.send("push", { data: { json: () => ({ kind: "start", count: 5 }) } });
  expect(w.shown).toHaveLength(2);
  expect(w.shown[0]?.title).toBe("誰かからスタンプが届きました");
  expect(w.shown[0]?.options.body).toContain("12件");
  expect(w.shown[1]?.title).toBe("誰かがトレーニングを開始しました");
});
test("通知タップは既存画面をホームへ戻し、閉じていればホームを開く", async () => {
  const w = worker();
  const notice = { close: () => {} };
  await w.send("notificationclick", { notification: notice });
  expect(w.messages).toContainEqual({ type: "notification-home" });
  expect(w.focused()).toBe(true);
  w.empty();
  await w.send("notificationclick", { notification: notice });
  expect(w.opened()).toBe("/?notification=home");
});
