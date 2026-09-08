import { useEffect, useRef, useState } from "react";

const steps = [
  {
    title: "いつもの仲間と、グループで。",
    description:
      "「グループ」からチームを作るか、仲間にもらった招待コードで参加しましょう。アカウントは管理者が発行します。",
    hint: "ひとりで記録することもできます。グループへの参加はあとからでも大丈夫。",
  },
  {
    title: "今日のトレーニングを残そう。",
    description:
      "「トレーニングを記録」から、日付・種目・重量・回数を入力します。セットや種目は必要な分だけ追加できます。",
    hint: "入力途中は下書き。確定するまでは仲間に共有されません。",
  },
  {
    title: "共有する相手は、自分で選ぶ。",
    description:
      "保存前に共有先を確認しましょう。選んだグループのメンバーだけに、表示名とトレーニング内容が共有されます。",
    hint: "「自分だけの記録」なら本人だけが閲覧できます。過去の個人記録が、参加後に自動で共有されることはありません。",
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
      <p className="muted">使い方ガイドの表示状態を保存できず、次回も表示されることがあります。</p>
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
      {storageWarning && (
        <p className="muted">表示状態を保存できず、次回も表示されることがあります。</p>
      )}
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
