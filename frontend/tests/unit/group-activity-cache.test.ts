import { expect, test } from "bun:test";
import { ResourceCache } from "../../src/features/training/resource-cache";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("隣の共有権限喪失はそのフィードを消し、現在表示中の別グループを保持する", async () => {
  let denied = false;
  const cache = new ResourceCache(
    async (path: string) => {
      if (denied && path === "neighbor")
        throw Object.assign(new Error("閲覧不可"), { status: 403 });
      return path;
    },
    Date.now,
    60_000,
    5,
    false,
  );
  cache.request("current", true);
  cache.request("neighbor");
  await tick();
  denied = true;
  cache.request("neighbor", true, true);
  await tick();
  expect(cache.read("neighbor")?.data).toBeUndefined();
  expect(cache.read("neighbor")?.error).toBe("閲覧不可");
  expect(cache.read("current")?.data).toBe("current");
  cache.clear();
});

test("グループの保持は5件までに制限し、破棄後の遅い先読みを採用しない", async () => {
  let release = (_value: string) => {};
  const cache = new ResourceCache(
    async (path: string) => {
      if (path === "pending")
        return new Promise<string>((resolve) => {
          release = resolve;
        });
      return path;
    },
    Date.now,
    60_000,
    5,
    false,
  );
  for (let i = 0; i < 6; i++) {
    cache.request(String(i));
    await tick();
  }
  expect(cache.read("0")).toBeUndefined();
  expect(cache.read("1")?.data).toBe("1");
  cache.request("pending");
  cache.clear();
  release("古い共有記録");
  await tick();
  expect(cache.read("pending")).toBeUndefined();
});
