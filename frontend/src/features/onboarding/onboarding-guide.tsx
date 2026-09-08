import { useEffect, useRef, useState } from "react";

const steps = [
  {
    title: "仲間とつながる",
    description: "「グループ」で作成・招待コードから参加。ひとりでも記録できます。",
    hint: "共有先に選んだグループだけに、表示名と記録が見えます。メモは自分だけに表示されます。",
    tips: [
      "招待コードを再発行すると旧コードは無効になります。",
      "退出・除外後も本人の記録は残ります。再参加しても再共有されません。オーナーは退出できません。",
    ],
  },
  {
    title: "トレーニングを記録",
    description: "「記録する」で日付・種目・セットを入力。種目リストは追加・削除できます。",
    hint: "新規入力はこのブラウザに下書き保存されます。保存前は共有されません。",
    tips: [
      "Enterで次の欄へ。最後の回数欄ではセットを追加します。重量欄で空のままEnterを押すと前セットの重量を採用します。",
      "種目リストから削除しても記録と下書きは残ります。コピーは今日・自分だけの新規下書きになります。",
    ],
  },
  {
    title: "記録を振り返る",
    description: "カレンダーはセット数で色分け。日付をタップすると、その日の記録が見られます。",
    hint: "「自分の記録」から編集・削除・コピー・メモを使えます。",
    tips: [
      "編集とメモは保存ボタンで確定します。保存前に閉じると入力は消えます。編集では共有先を変更できません。",
      "メモは1000文字まで。空欄を保存すると消去されます。記録の削除は共有先にも反映され、元に戻せません。",
      "表示名は過去の共有記録にも反映されます。メール・パスワードの変更は管理者へ。",
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
          GO TOREのはじめ方 · {step + 1} / {steps.length}
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
