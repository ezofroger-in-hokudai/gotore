import { expect, test } from "bun:test";
import { createSessionId } from "../../src/features/session/session-id";

test("secure contextでなくてもUUID形式のセッションIDを生成する", () => {
  const id = createSessionId(null, () => 0);

  expect(id).toBe("00000000-0000-4000-8000-000000000000");
});

test("利用できる場合はWeb CryptoのUUIDをそのまま使う", () => {
  expect(createSessionId(() => "a0b1c2d3-e4f5-4678-9abc-def012345678")).toBe(
    "a0b1c2d3-e4f5-4678-9abc-def012345678",
  );
});
