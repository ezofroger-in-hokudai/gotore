import assert from "node:assert/strict";
import { test } from "node:test";
import manifest from "../../src/app/manifest";

test("ホーム画面の名前・起動先・表示モードとアイコンを定義する", () => {
  const value = manifest();
  assert.equal(value.name, "GO TORE");
  assert.equal(value.short_name, "GO TORE");
  assert.equal(value.start_url, "/");
  assert.equal(value.scope, "/");
  assert.equal(value.display, "standalone");
  assert.equal(value.lang, "ja");
  assert.deepEqual(
    value.icons?.map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );
});
