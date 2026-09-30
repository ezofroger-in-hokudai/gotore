import { expect, test } from "../fixtures";
import { navigate, openGroup } from "../mock-training";
import { backendUrl } from "../test-server";

test("実DBの個人グラフは非公開も集計し、グループのランキングは共有記録だけを表示する", async ({
  page,
}) => {
  const { localAuth, testPassword } = await import("../local-auth");
  const { admin, publicAuth } = localAuth();
  const email = `gotore-analytics-${crypto.randomUUID()}@example.test`;
  const created = await admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
    user_metadata: { display_name: "集計テスト" },
  });
  expect(created.error).toBeNull();
  const signed = await publicAuth.signInWithPassword({ email, password: testPassword });
  if (!signed.data.session) throw new Error("テスト用ログインに失敗しました");
  const headers = { Authorization: `Bearer ${signed.data.session.access_token}` };
  const groupResponse = await page.request.post(`${backendUrl}/api/groups`, {
    headers,
    data: { name: "集計確認部" },
  });
  expect(groupResponse.status()).toBe(201);
  const group = await groupResponse.json();
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  for (const [groupId, weight] of [
    [group.id, 80],
    [null, 60],
  ] as const) {
    const response = await page.request.post(`${backendUrl}/api/workouts`, {
      headers,
      data: {
        id: crypto.randomUUID(),
        group_id: groupId,
        performed_on: day,
        exercises: [{ name: "ベンチプレス", sets: [{ weight, reps: 10 }] }],
      },
    });
    expect(response.status()).toBe(201);
  }
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "スキップ", exact: true }).click();
  await navigate(page, "履歴");
  await page.getByRole("tab", { name: "グラフ", exact: true }).click();
  await expect(page.locator(".personal-history-graph-value")).toContainText("1,400");
  await openGroup(page);
  const response = await page.request.get(
    `${backendUrl}/api/groups/${group.id}/analytics?period=all&offset=0`,
    { headers },
  );
  expect(response.ok()).toBe(true);
  const aggregate = await response.json();
  expect(aggregate.totals.volume).toBe(800);
  expect(aggregate.rankings.volume).toEqual([
    expect.objectContaining({ display_name: "集計テスト", value: 800 }),
  ]);
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "グラフ", exact: true })
    .click();
  await expect(page.locator(".group-history-graph .personal-history-graph-value")).toContainText(
    "800",
  );
});
