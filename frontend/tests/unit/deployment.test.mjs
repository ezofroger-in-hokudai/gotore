import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import nextConfig from "../../next.config.mjs";

test("Servicesは既存のディレクトリとAPIパスを維持する", () => {
  const config = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.services.frontend.root, "frontend");
  assert.equal(config.services.frontend.framework, "nextjs");
  assert.equal(config.services.backend.root, "backend");
  assert.equal(config.services.backend.framework, "fastapi");
  assert.equal(config.services.backend.entrypoint, "app.main:app");
  assert.deepEqual(config.rewrites, [
    { source: "/api/(.*)", destination: { service: "backend" } },
    { source: "/(.*)", destination: { service: "frontend" } },
  ]);
});

test("Vercelではlocalhostにも別ホストにもAPIを転送しない", async () => {
  const previous = { vercel: process.env.VERCEL, backend: process.env.BACKEND_INTERNAL_URL };
  try {
    process.env.VERCEL = "1";
    for (const target of [undefined, "https://old-api.example.test"]) {
      restore("BACKEND_INTERNAL_URL", target);
      assert.deepEqual(await nextConfig.rewrites(), []);
    }
  } finally {
    restore("VERCEL", previous.vercel);
    restore("BACKEND_INTERNAL_URL", previous.backend);
  }
});

test("通常のローカル起動では既定または指定したAPIへ転送する", async () => {
  const previous = { vercel: process.env.VERCEL, backend: process.env.BACKEND_INTERNAL_URL };
  try {
    restore("VERCEL", undefined);
    restore("BACKEND_INTERNAL_URL", undefined);
    assert.deepEqual(await nextConfig.rewrites(), [
      { source: "/api/:path*", destination: "http://localhost:8000/api/:path*" },
    ]);
    process.env.BACKEND_INTERNAL_URL = "http://backend:8000";
    assert.deepEqual(await nextConfig.rewrites(), [
      { source: "/api/:path*", destination: "http://backend:8000/api/:path*" },
    ]);
  } finally {
    restore("VERCEL", previous.vercel);
    restore("BACKEND_INTERNAL_URL", previous.backend);
  }
});

function restore(name, value) {
  // undefinedの代入は文字列になるため、未設定の環境変数は削除して復元する。
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
