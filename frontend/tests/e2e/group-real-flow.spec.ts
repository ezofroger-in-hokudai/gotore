import { type Page, expect, test } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { createTestUser, testPassword } from "./local-auth";
import { navigate } from "./mock-training";

async function login(page: Page, name: string, email: string) {
  await createTestUser(name, email);
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "スキップ", exact: true }).click();
}

async function groupSettings(page: Page, name: string) {
  await navigate(page, "グループ");
  await page.getByRole("button", { name: `${name}の詳細`, exact: true }).click();
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "設定", exact: true })
    .click();
}

test("QRを復号して複数人が参加し、名前変更・オーナー移譲・退出・削除を確認する", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const run = crypto.randomUUID();
  const contexts = await Promise.all(
    Array.from({ length: 3 }, () => browser.newContext({ viewport: { width: 390, height: 844 } })),
  );
  const [owner, member, third] = await Promise.all(contexts.map((context) => context.newPage()));
  const errors: string[] = [];
  for (const page of [owner, member, third])
    page.on("pageerror", (error) => errors.push(error.message));
  try {
    await login(owner, "QRオーナー", `gotore-${run}-owner@example.test`);
    await navigate(owner, "グループ");
    await owner.getByRole("button", { name: "作成", exact: true }).click();
    await owner.getByLabel("グループ名", { exact: true }).fill("QR動作テスト");
    await owner.getByRole("button", { name: "作成する", exact: true }).click();
    const qrStage = owner.locator(".group-invite-qr-stage");
    await expect(qrStage.locator("img.group-invite-qr")).toBeVisible();
    const image = PNG.sync.read(await qrStage.screenshot());
    const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
    expect(decoded?.data).toContain(`${new URL(owner.url()).origin}/?groupInvite=`);
    if (!decoded) throw new Error("招待QRコードを復号できませんでした");
    const inviteUrl = decoded.data;
    await owner.getByRole("button", { name: "完了", exact: true }).click();

    const memberEmail = `gotore-${run}-member@example.test`;
    await createTestUser("QR参加者", memberEmail);
    await member.goto(inviteUrl);
    await member.getByLabel("メールアドレス", { exact: true }).fill(memberEmail);
    await member.getByLabel("パスワード", { exact: true }).fill(testPassword);
    await member.getByRole("button", { name: "ログイン", exact: true }).click();
    const confirmation = member.locator(".group-join-detail");
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText("QR動作テスト");
    await expect(confirmation).toContainText("QRオーナー");
    await expect(confirmation).toContainText("参加後の記録から共有されます");
    await confirmation.getByRole("button", { name: "このグループに参加", exact: true }).click();
    await expect(member.locator(".group-join-detail")).toHaveCount(0);
    await expect(member.getByRole("heading", { name: "QR動作テスト", exact: true })).toBeVisible();
    await expect.poll(() => new URL(member.url()).searchParams.has("groupInvite")).toBe(false);
    await navigate(member, "ホーム");
    await expect(member.getByRole("dialog", { name: "グループへの招待" })).toHaveCount(0);
    await member.goBack();
    await expect(member.getByRole("dialog", { name: "グループへの招待" })).toHaveCount(0);
    await navigate(member, "グループ");
    await expect(member.getByRole("dialog", { name: "グループへの招待" })).toHaveCount(0);
    await member.reload();
    await expect(member.getByRole("dialog", { name: "グループへの招待" })).toHaveCount(0);
    const reopenedPreview = member.waitForResponse((response) =>
      response.url().includes("/group-invites/preview"),
    );
    await member.goto(inviteUrl);
    expect((await reopenedPreview).status()).toBe(200);
    await expect(member.getByRole("dialog", { name: "グループへの招待" })).toHaveCount(0);
    await expect.poll(() => new URL(member.url()).searchParams.has("groupInvite")).toBe(false);
    await navigate(member, "ホーム");
    await expect(member.getByRole("dialog", { name: "グループへの招待" })).toHaveCount(0);
    await member.goBack();
    await expect(member.getByRole("dialog", { name: "グループへの招待" })).toHaveCount(0);

    await login(third, "再利用確認", `gotore-${run}-third@example.test`);
    await third.goto(inviteUrl);
    const thirdConfirmation = third.locator(".group-join-detail");
    await expect(thirdConfirmation).toContainText("メンバー 2人");
    await expect(thirdConfirmation).toContainText("QR参加者");
    await thirdConfirmation
      .getByRole("button", { name: "このグループに参加", exact: true })
      .click();
    await expect(third.getByRole("heading", { name: "QR動作テスト", exact: true })).toBeVisible();

    await groupSettings(owner, "QR動作テスト");
    await owner.getByRole("button", { name: "グループ名を編集" }).click();
    await owner
      .getByRole("textbox", { name: "グループ名", exact: true })
      .fill("改名したQR動作テスト");
    await owner.getByRole("button", { name: "決定", exact: true }).click();
    await expect(owner.getByRole("button", { name: "グループ名を編集" })).toHaveText(
      "改名したQR動作テスト",
    );
    await owner.getByRole("button", { name: "QR参加者の設定" }).click();
    await owner.getByRole("button", { name: "オーナーにする" }).click();
    await expect(owner.locator(".group-settings")).toContainText("QR参加者");
    await owner.getByRole("button", { name: "グループから抜ける" }).click();
    await owner.getByRole("button", { name: "抜ける", exact: true }).click();
    await expect(owner.getByRole("heading", { name: "グループ", exact: true })).toBeVisible();

    await member.reload();
    await member.getByRole("button", { name: "スキップ", exact: true }).click();
    await groupSettings(member, "改名したQR動作テスト");
    await member.getByRole("button", { name: "グループを削除", exact: true }).click();
    await member.getByRole("button", { name: "削除する", exact: true }).click();
    await expect(member.getByRole("heading", { name: "グループはありません" })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
