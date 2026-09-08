import { useEffect, useRef, useState } from "react";

const steps = [
  {
    title: "仲間とつながる",
    description: "グループを作成、または招待コードで参加。ひとりでも使えます。",
    hint: "表示名と記録は選んだグループだけに共有。メモは自分だけ。",
    tips: [
      "再発行で旧コードは無効。",
      "退出・除外後も本人の記録は残り、再参加しても再共有しません。オーナーは退出不可。",
    ],
  },
  {
    title: "トレーニングを記録",
    description: "日付・種目・セットを入力。種目リストは追加・削除できます。",
    hint: "新規入力はブラウザに下書き保存。確定前は非共有。",
    tips: [
      "Enterで次の欄へ。最後の回数欄ではセット追加。空の重量欄では前セットの重量を採用。",
      "種目削除後も記録・下書きは保持。コピーは今日・自分だけの新規下書き。",
    ],
  },
  {
    title: "記録を振り返る",
    description: "カレンダーはセット数で色分け。タップでその日の記録へ。",
    hint: "「自分の記録」で編集・削除・コピー・メモ。",
    tips: [
      "編集・メモは保存で確定。閉じると未保存の入力は消えます。共有先は編集不可。",
      "メモは1000文字まで。空欄保存で消去。記録削除は共有先にも反映され、復元不可。",
      "表示名は過去の記録にも反映。メール・パスワード変更は管理者へ。",
    ],
  },
];

export function OnboardingGuide({ userId, replay }: { userId: string; replay: number }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [storageWarning, setStorageWarning] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const storageKey = `gotore:onboarding:v1:${userId}`;

  useEffect(() => {
    if (replay > 0) {
      setStep(0);
      setOpen(true);
      return;
    }
    try {
      setOpen(localStorage.getItem(storageKey) !== "seen");
    } catch {
      setStorageWarning(true);
      setOpen(true);
    }
  }, [storageKey, replay]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ステップ切替・再表示時にも読み上げ位置を戻す。
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, step, replay]);

  function close() {
    try {
      localStorage.setItem(storageKey, "seen");
    } catch {
      setStorageWarning(true);
    }
    setOpen(false);
  }

  if (!open) {
    return storageWarning ? (
      <p className="muted">次回もガイドが表示される場合があります。</p>
    ) : null;
  }

  return (
    <section className="panel onboarding-guide" aria-label="使い方ガイド">
      <div className="onboarding-header">
        <p className="eyebrow">
          使い方 · {step + 1} / {steps.length}
        </p>
        <button className="text-button" type="button" onClick={close}>
          スキップ
        </button>
      </div>
      <h2 ref={heading} tabIndex={-1}>
        {steps[step].title}
      </h2>
      <p>{steps[step].description}</p>
      <p className="onboarding-hint">{steps[step].hint}</p>
      <details>
        <summary>操作のヒント</summary>
        <ul>
          {steps[step].tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </details>
      {storageWarning && <p className="muted">次回もガイドが表示される場合があります。</p>}
      <div className="onboarding-actions">
        <button
          className="secondary"
          type="button"
          disabled={step === 0}
          onClick={() => setStep((value) => value - 1)}
        >
          戻る
        </button>
        {step < steps.length - 1 ? (
          <button className="primary" type="button" onClick={() => setStep((value) => value + 1)}>
            次へ
          </button>
        ) : (
          <button className="primary" type="button" onClick={close}>
            はじめる
          </button>
        )}
      </div>
    </section>
  );
}
