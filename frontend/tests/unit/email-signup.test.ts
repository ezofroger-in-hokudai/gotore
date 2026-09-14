import assert from "node:assert/strict";
import { test } from "node:test";
import { authErrorMessage, signupValues } from "../../src/features/auth/signup";

test("登録の名前とメールだけを正規化し、名前の境界と新規パスワードを検証する", () => {
  assert.deepEqual(signupValues(" 😀 ", " user@example.test ", " pass1234 "), {
    name: "😀",
    email: "user@example.test",
    password: " pass1234 ",
  });
  assert.equal(signupValues("😀".repeat(20), "user@example.test", "12345678").name.length, 40);
  for (const name of ["  ", "名".repeat(21), "😀".repeat(21)]) {
    assert.throws(() => signupValues(name, "user@example.test", "12345678"), /1〜20文字/);
  }
  assert.throws(() => signupValues("本人", "user@example.test", "1234567"), /8文字/);
});

test("認証の内部メッセージを表示せず、送信制限と未確認を案内する", () => {
  assert.match(authErrorMessage({ code: "over_email_send_rate_limit" }), /時間/);
  assert.match(authErrorMessage({ code: "email_not_confirmed" }), /メール/);
  assert.ok(!authErrorMessage({ message: "private-key-internal" }).includes("private-key"));
});
