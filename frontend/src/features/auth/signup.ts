export function signupValues(name: string, email: string, password: string) {
  const trimmed = name.trim();
  if (!trimmed || Array.from(trimmed).length > 20) throw new Error("表示名は1〜20文字です。");
  if (password.length < 8) throw new Error("パスワードは8文字以上です。");
  return { name: trimmed, email: email.trim(), password };
}

export function isAuthRateLimit(error: { code?: string; status?: number }) {
  return (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
  );
}

export function authErrorMessage(error: {
  code?: string;
  status?: number;
  message?: string;
}) {
  if (isAuthRateLimit(error)) return "送信が混み合っています。時間をおいて再試行してください。";
  switch (error.code) {
    case "email_not_confirmed":
      return "確認メールのリンクを開いてからログインしてください。";
    case "invalid_credentials":
      return "ログインできません。入力を確認し、解決しなければ管理者へ。";
    case "weak_password":
      return "より長く、推測されにくいパスワードを入力してください。";
    case "email_address_invalid":
      return "メールアドレスを確認してください。";
    case "signup_disabled":
    case "email_address_not_authorized":
      return "現在、新規登録の受付を準備中です。時間をおいて再試行してください。";
    default:
      return "接続または処理に失敗しました。時間をおいて再試行してください。";
  }
}

export function confirmationUrl(origin: string) {
  return new URL("/auth/confirm", origin).href;
}
