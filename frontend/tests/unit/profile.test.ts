import assert from "node:assert/strict";
import { test } from "node:test";
import { saveDisplayName } from "../../src/features/settings/profile";

test("表示名だけを正規化して更新し、その後プロフィールを同期する", async () => {
  const calls: string[] = [];
  assert.deepEqual(
    await saveDisplayName("  新しい名前  ", {
      updateAuth: async (name) => {
        calls.push(name);
      },
      syncProfile: async () => {
        calls.push("sync");
      },
    }),
    { name: "新しい名前", synced: true },
  );
  assert.deepEqual(calls, ["新しい名前", "sync"]);
});

test("空白だけ・20文字超はAuth更新前に拒否する", async () => {
  let calls = 0;
  for (const name of ["", "  ", "名".repeat(21)]) {
    await assert.rejects(
      saveDisplayName(name, {
        updateAuth: async () => {
          calls++;
        },
        syncProfile: async () => {
          calls++;
        },
      }),
      /1〜20文字/,
    );
  }
  assert.equal(calls, 0);
});

test("Auth失敗時は同期せず、内部エラーを表示に漏らさない", async () => {
  await assert.rejects(
    saveDisplayName("本人", {
      updateAuth: async () => {
        throw new Error("private-auth-diagnostic");
      },
      syncProfile: async () => {
        assert.fail("Auth失敗時に同期しない");
      },
    }),
    { message: "表示名を変更できませんでした。接続を確認して再試行してください。" },
  );
});

test("Auth成功後の同期失敗は部分成功として再試行できる", async () => {
  const result = await saveDisplayName("本人", {
    updateAuth: async () => {},
    syncProfile: async () => {
      throw new Error("private-db-diagnostic");
    },
  });
  assert.deepEqual(result, { name: "本人", synced: false });
});
