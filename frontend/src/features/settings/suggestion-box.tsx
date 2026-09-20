import { ApiError, api } from "@/lib/api";
import { type FormEvent, useRef, useState } from "react";

export function useSuggestionBox() {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const sending = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    setError("");
    setMessage("");
    const normalized = content.trim();
    if (!normalized || Array.from(normalized).length > 2000) {
      setError("内容を1〜2000文字で入力してください。");
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const payload = pending ?? {
        id: crypto.randomUUID(),
        content: normalized,
      };
      setPending(payload);
      await api("/suggestions", {
        method: "POST",
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      setContent("");
      setPending(null);
      setMessage("送信しました。ご意見ありがとうございます。");
    } catch (reason) {
      // 入力不正で受け付けられなかった場合だけ、内容の修正を許可する。
      if (reason instanceof ApiError && reason.status === 422) setPending(null);
      setError(reason instanceof Error ? reason.message : "送信できませんでした。");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return { content, setContent, busy, error, message, pending, submit };
}

export function SuggestionBox({ state }: { state: ReturnType<typeof useSuggestionBox> }) {
  return (
    <form className="suggestion-box" onSubmit={state.submit}>
      <p>ご意見・ご要望・不具合をお寄せください。</p>
      <p className="muted" id="suggestion-privacy">
        内容と送信者は運営管理者だけが確認します。
      </p>
      <label htmlFor="suggestion-content">内容</label>
      <textarea
        id="suggestion-content"
        value={state.content}
        readOnly={state.busy || !!state.pending}
        rows={6}
        aria-describedby="suggestion-privacy suggestion-limit suggestion-retention"
        onChange={(event) => state.setContent(event.target.value)}
        placeholder="気づいたことや、あるとうれしい機能など"
      />
      <p className="muted" id="suggestion-limit">
        {Array.from(state.content.trim()).length} / 2000文字
      </p>
      <p className="muted" id="suggestion-retention">
        設定を離れたり再読み込みすると、未送信の内容は消えます。
      </p>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
          {state.pending && " 受付状況を確認するため、内容を変えずに再送してください。"}
        </p>
      )}
      {state.message && <output className="notice">{state.message}</output>}
      <button className="primary full" type="submit" disabled={state.busy}>
        {state.busy ? "送信中…" : state.pending ? "再送する" : "送信する"}
      </button>
    </form>
  );
}
