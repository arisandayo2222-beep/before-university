"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Database,
  FileUp,
  Flag,
  HelpCircle,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createEmptyData,
  type Category,
  type Goal,
  type RoadmapData,
} from "./roadmap-data";
import type { OnboardingDraft, OnboardingGoalDraft } from "./local-data";

const categoryChoices: Array<{ value: Category | "undecided"; label: string }> =
  [
    { value: "programming", label: "プログラミング・AI" },
    { value: "learning", label: "学習・読書" },
    { value: "creative", label: "制作" },
    { value: "health", label: "健康・運動" },
    { value: "travel", label: "旅行・体験" },
    { value: "money", label: "お金・準備" },
    { value: "undecided", label: "まだ決まっていない" },
  ];

const emptyGoal = (): OnboardingGoalDraft => ({
  title: "",
  category: "undecided",
  targetMonth: "",
  note: "",
});
const todayKey = () => new Date().toISOString().slice(0, 10);

function stepTitle(step: number) {
  return ["ようこそ", "ゴールを設定する", "やりたいことを登録する", "準備完了"][
    step - 1
  ];
}

export function Onboarding({
  initialDraft,
  onPersistDraft,
  onComplete,
  onRequestImport,
}: {
  initialDraft: OnboardingDraft | null;
  onPersistDraft: (draft: OnboardingDraft) => Promise<void>;
  onComplete: (data: RoadmapData) => Promise<void>;
  onRequestImport: (tab: "ai" | "file") => void;
}) {
  const [step, setStep] = useState(
    Math.min(4, Math.max(1, initialDraft?.step ?? 1)),
  );
  const [roadmapName, setRoadmapName] = useState(
    initialDraft?.roadmapName ?? "",
  );
  const [eventName, setEventName] = useState(
    initialDraft?.eventName ?? "",
  );
  const [startDate, setStartDate] = useState(
    initialDraft?.startDate ?? todayKey(),
  );
  const [finalGoal, setFinalGoal] = useState(
    initialDraft?.finalGoal ?? "",
  );
  const [targetDate, setTargetDate] = useState(
    initialDraft?.targetDate ?? "",
  );
  const [goals, setGoals] = useState<OnboardingGoalDraft[]>(
    initialDraft?.goals?.length ? initialDraft.goals : [emptyGoal()],
  );
  const [dateError, setDateError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void onPersistDraft({
        step,
        roadmapName,
        eventName,
        startDate,
        finalGoal,
        targetDate,
        goals,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [step, roadmapName, eventName, startDate, finalGoal, targetDate, goals, onPersistDraft]);

  const nextFromGoal = () => {
    if (!eventName.trim()) return;
    if (!startDate || !targetDate || targetDate <= startDate) {
      setDateError("イベント日は開始日より後にしてください");
      return;
    }
    setDateError("");
    setStep(3);
  };

  const complete = async () => {
    setSubmitting(true);
    try {
      const data = createEmptyData({
        roadmapName,
        eventName,
        eventDescription: finalGoal,
        finalGoal: finalGoal.trim() || `${eventName.trim()}までに、やりたいことを実現する`,
        startDate,
        targetDate,
        onboardingCompleted: true,
        guideCompleted: false,
      });
      const createdAt = todayKey();
      data.goals = goals
        .filter((item) => item.title.trim())
        .map((item, index): Goal => ({
          id: `goal-${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${index}`}`,
          title: item.title.trim(),
          titleJa: item.title.trim(),
          description: item.note.trim(),
          category: item.category === "undecided" ? "life" : item.category,
          progress: 0,
          createdAt,
          completedAt: null,
          notes: item.note.trim(),
          targetMonth: item.targetMonth || null,
        }));
      await onComplete(data);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategories = [
    ...new Set(
      goals
        .filter((item) => item.title.trim())
        .map(
          (item) =>
            categoryChoices.find((choice) => choice.value === item.category)
              ?.label ?? "その他",
        ),
    ),
  ];

  return (
    <main className="onboarding-shell min-h-dvh px-4 py-6 sm:grid sm:place-items-center sm:px-6">
      <section
        className="ios-surface mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] sm:min-h-0"
        aria-labelledby="onboarding-title"
      >
        <header className="border-b border-[var(--separator)] px-5 py-5 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-primary">
                {step} / 4
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {stepTitle(step)}
              </p>
            </div>
            <div
              className="flex gap-1.5"
              aria-label={`4ステップ中${step}ステップ目`}
            >
              {[1, 2, 3, 4].map((item) => (
                <span
                  key={item}
                  className={cn(
                    "h-1.5 w-8 rounded-full",
                    item <= step ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>
          </div>
        </header>

        <div className="onboarding-step flex-1 overflow-y-auto px-5 py-7 sm:px-8 sm:py-9">
          {step === 1 ? (
            <div>
              <div className="grid size-14 place-items-center rounded-[20px] bg-primary text-primary-foreground">
                <Flag className="size-7" />
              </div>
              <h1
                ref={titleRef}
                tabIndex={-1}
                id="onboarding-title"
                className="mt-6 text-3xl font-semibold leading-tight tracking-[-0.045em] outline-none sm:text-4xl"
              >
                大切な日までに、
                <br />
                やりたいことを形にしよう
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
                Before
                Roadmapは、イベントの日までにやりたいことと進み具合を整理する、自分専用の計画です。
              </p>
              <div className="mt-7 rounded-2xl border border-primary/18 bg-primary/[0.06] p-5">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="font-semibold">
                      データはこの端末だけに保存
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      入力した目標、タスク、進捗、メモは、このブラウザ内だけに保存されます。アカウントやほかの端末には自動で同期されません。
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      ブラウザのデータを削除すると失われるため、あとからJSONバックアップを書き出せます。
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <Button className="h-12 rounded-xl" onClick={() => setStep(2)}>
                  新しく作成する
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-12 rounded-xl"
                  onClick={() => onRequestImport("ai")}
                >
                  <Sparkles className="size-4" />
                  AIと一緒に作る
                </Button>
                <Button
                  variant="ghost"
                  className="h-12 rounded-xl"
                  onClick={() => onRequestImport("file")}
                >
                  <FileUp className="size-4" />
                  バックアップから読み込む
                </Button>
                <Button
                  variant="ghost"
                  className="h-12 rounded-xl"
                  onClick={() => setHelpOpen(true)}
                >
                  <HelpCircle className="size-4" />
                  使い方だけ見る
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <h1
                ref={titleRef}
                tabIndex={-1}
                id="onboarding-title"
                className="text-3xl font-semibold tracking-[-0.04em] outline-none"
              >
                イベントを設定する
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                名前や学校名などの個人情報を入力する必要はありません。
              </p>
              <div className="mt-8 space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="onboarding-name">ロードマップ名（任意）</Label>
                  <Input
                    id="onboarding-name"
                    value={roadmapName}
                    onChange={(event) =>
                      setRoadmapName(event.target.value.slice(0, 200))
                    }
                    className="h-12 rounded-xl"
                  />
                  <p className="text-xs text-muted-foreground">
                    例：文化祭まで、資格試験ロードマップ
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="onboarding-event">イベント名</Label>
                  <Input
                    id="onboarding-event"
                    value={eventName}
                    onChange={(event) => setEventName(event.target.value.slice(0, 200))}
                    className="h-12 rounded-xl"
                    required
                  />
                  <p className="text-xs text-muted-foreground">例：大学入学、文化祭、作品公開</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="onboarding-goal">実現したい状態（任意）</Label>
                  <Textarea
                    id="onboarding-goal"
                    value={finalGoal}
                    onChange={(event) =>
                      setFinalGoal(event.target.value.slice(0, 500))
                    }
                    className="min-h-24 rounded-xl"
                  />
                  <p className="text-xs text-muted-foreground">
                    例：イベント当日に、自信を持って作品を発表できる
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="onboarding-start-date">開始日</Label>
                  <Input
                    id="onboarding-start-date"
                    type="date"
                    value={startDate}
                    onChange={(event) => { setStartDate(event.target.value); setDateError(""); }}
                    className="h-12 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="onboarding-date">イベント日</Label>
                  <Input
                    id="onboarding-date"
                    type="date"
                    min={startDate}
                    value={targetDate}
                    onChange={(event) => {
                      setTargetDate(event.target.value);
                      setDateError("");
                    }}
                    className="h-12 rounded-xl"
                    aria-invalid={Boolean(dateError)}
                    aria-describedby={
                      dateError ? "onboarding-date-error" : undefined
                    }
                  />
                  {dateError ? (
                    <p
                      id="onboarding-date-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {dateError}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <h1
                ref={titleRef}
                tabIndex={-1}
                id="onboarding-title"
                className="text-3xl font-semibold tracking-[-0.04em] outline-none"
              >
                何をやってみたいですか？
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                「やりたいこと」だけで登録できます。空のまま始めることもできます。
              </p>
              <div className="mt-7 space-y-4">
                {goals.map((goal, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-[var(--separator)] bg-[var(--surface-subtle)] p-4 sm:p-5"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        やりたいこと {index + 1}
                      </p>
                      {goals.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setGoals((items) =>
                              items.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          削除
                        </Button>
                      ) : null}
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor={`goal-title-${index}`}>
                          やりたいこと
                        </Label>
                        <Input
                          id={`goal-title-${index}`}
                          value={goal.title}
                          onChange={(event) =>
                            setGoals((items) =>
                              items.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      title: event.target.value.slice(0, 300),
                                    }
                                  : item,
                              ),
                            )
                          }
                          placeholder="例：自分のアプリを作りたい"
                          className="h-12 rounded-xl"
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>カテゴリ</Label>
                          <Select
                            value={goal.category}
                            onValueChange={(value) =>
                              setGoals((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        category:
                                          value as OnboardingGoalDraft["category"],
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            <SelectTrigger className="h-12 w-full rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {categoryChoices.map((choice) => (
                                <SelectItem
                                  key={choice.value}
                                  value={choice.value}
                                >
                                  {choice.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`goal-month-${index}`}>
                            目標時期（任意）
                          </Label>
                          <Input
                            id={`goal-month-${index}`}
                            type="month"
                            max={targetDate.slice(0, 7)}
                            value={goal.targetMonth}
                            onChange={(event) =>
                              setGoals((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        targetMonth: event.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                            className="h-12 rounded-xl"
                          />
                        </div>
                      </div>
                      <details>
                        <summary className="cursor-pointer rounded-lg py-2 text-sm font-medium text-primary">
                          短いメモを追加
                        </summary>
                        <div className="pt-2">
                          <Label
                            className="sr-only"
                            htmlFor={`goal-note-${index}`}
                          >
                            短いメモ
                          </Label>
                          <Textarea
                            id={`goal-note-${index}`}
                            value={goal.note}
                            onChange={(event) =>
                              setGoals((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        note: event.target.value.slice(0, 5000),
                                      }
                                    : item,
                                ),
                              )
                            }
                            placeholder="何を形にしたいかを短く書けます"
                            className="min-h-20 rounded-xl"
                          />
                        </div>
                      </details>
                    </div>
                  </div>
                ))}
              </div>
              {goals.length < 3 ? (
                <Button
                  variant="outline"
                  className="mt-4 h-11 rounded-xl"
                  onClick={() => setGoals((items) => [...items, emptyGoal()])}
                >
                  <Plus className="size-4" />
                  やりたいことを追加
                </Button>
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div>
              <div className="grid size-14 place-items-center rounded-[20px] bg-[color:color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]">
                <Check className="size-7" />
              </div>
              <h1
                ref={titleRef}
                tabIndex={-1}
                id="onboarding-title"
                className="mt-6 text-3xl font-semibold tracking-[-0.04em] outline-none"
              >
                ロードマップの準備ができました
              </h1>
              <div className="mt-7 divide-y divide-[var(--separator)] rounded-2xl border border-[var(--separator)] bg-[var(--surface-subtle)] px-5">
                <div className="flex items-center justify-between gap-4 py-4">
                  <span className="text-sm text-muted-foreground">目標日</span>
                  <strong>
                    {new Intl.DateTimeFormat("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    }).format(new Date(`${targetDate}T00:00:00`))}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-4 py-4">
                  <span className="text-sm text-muted-foreground">
                    登録した目標
                  </span>
                  <strong>
                    {goals.filter((item) => item.title.trim()).length}件
                  </strong>
                </div>
                <div className="flex items-start justify-between gap-4 py-4">
                  <span className="text-sm text-muted-foreground">
                    カテゴリ
                  </span>
                  <strong className="max-w-[65%] text-right">
                    {selectedCategories.length
                      ? selectedCategories.join("、")
                      : "未登録"}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-4 py-4">
                  <span className="text-sm text-muted-foreground">保存先</span>
                  <strong className="inline-flex items-center gap-1.5">
                    <Database className="size-4 text-primary" />
                    この端末
                  </strong>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {step > 1 ? (
          <footer className="sticky bottom-0 border-t border-[var(--separator)] bg-card/92 px-5 py-4 backdrop-blur-xl sm:px-8">
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                className="h-12 rounded-xl"
                onClick={() => setStep((current) => Math.max(1, current - 1))}
              >
                <ArrowLeft className="size-4" />
                戻る
              </Button>
              {step === 2 ? (
                <Button
                  className="h-12 rounded-xl"
                  disabled={!eventName.trim() || !startDate || !targetDate}
                  onClick={nextFromGoal}
                >
                  やりたいことを決める
                  <ArrowRight className="size-4" />
                </Button>
              ) : null}
              {step === 3 ? (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="h-12 rounded-xl"
                    onClick={() => setStep(4)}
                  >
                    あとで決める
                  </Button>
                  <Button
                    className="h-12 rounded-xl"
                    onClick={() => setStep(4)}
                  >
                    内容を確認する
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              ) : null}
              {step === 4 ? (
                <Button
                  className="h-12 rounded-xl"
                  disabled={submitting}
                  onClick={() => void complete()}
                >
                  {submitting ? "保存しています" : "ロードマップを開く"}
                  <ChevronRight className="size-4" />
                </Button>
              ) : null}
            </div>
          </footer>
        ) : null}
      </section>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Before Universityの使い方</DialogTitle>
            <DialogDescription>
              目標を決め、今月の小さなタスクへ分け、進捗と記録を残します。
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm leading-6">
            <li className="rounded-xl bg-muted/60 p-4">
              <strong>1. Goal</strong>
              <br />
              最終的に形にしたいことを登録します。
            </li>
            <li className="rounded-xl bg-muted/60 p-4">
              <strong>2. Task</strong>
              <br />
              15〜30分で始められる行動へ分けます。
            </li>
            <li className="rounded-xl bg-muted/60 p-4">
              <strong>3. Progress</strong>
              <br />
              進行中・完了を更新して現在地を確認します。
            </li>
            <li className="rounded-xl bg-muted/60 p-4">
              <strong>4. Backup</strong>
              <br />
              設定から定期的にJSONを書き出します。
            </li>
          </ol>
          <DialogFooter>
            <Button onClick={() => setHelpOpen(false)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

const guideSteps = [
  {
    selector: "[data-guide='progress']",
    title: "進捗を確認する",
    description: "ここで、目標全体と今月の進み具合を確認できます",
  },
  {
    selector: "[data-guide='add-task']",
    title: "タスクを追加する",
    description: "やることが決まったら、ここからタスクを追加できます",
  },
  {
    selector: "[data-guide='task-status']",
    title: "タスクを進める",
    description: "取り組み始めたら進行中に変更し、終わったら完了にします",
  },
  {
    selector: "[data-guide='ask-ai']",
    title: "AIで次の一歩を考える",
    description:
      "タスクの情報からAIへ相談するプロンプトを端末内で作れます。自動送信はしません。外部AIへ貼り付ける前に、個人情報が含まれていないか確認してください",
  },
] as const;

export function FirstUseGuide({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}) {
  const [index, setIndex] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const step = guideSteps[index];
  const availableIndexes = guideSteps
    .map((item, itemIndex) =>
      typeof document !== "undefined" && document.querySelector(item.selector)
        ? itemIndex
        : -1,
    )
    .filter((itemIndex) => itemIndex >= 0);

  useEffect(() => {
    if (!open) return;
    const element = document.querySelector<HTMLElement>(step.selector);
    if (!element) {
      const next = guideSteps.findIndex(
        (item, itemIndex) =>
          itemIndex > index && document.querySelector(item.selector),
      );
      if (next >= 0) window.setTimeout(() => setIndex(next), 0);
      else if (index > 0) {
        onComplete();
        onOpenChange(false);
      }
      return;
    }
    element.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
    element.classList.add("guide-target-active");
    return () => element.classList.remove("guide-target-active");
  }, [index, open, step.selector, onComplete, onOpenChange]);

  const finish = () => {
    onComplete();
    onOpenChange(false);
    setIndex(0);
  };
  const move = (direction: 1 | -1) => {
    const candidates = availableIndexes.filter((itemIndex) =>
      direction === 1 ? itemIndex > index : itemIndex < index,
    );
    const next =
      direction === 1 ? candidates[0] : candidates[candidates.length - 1];
    if (next === undefined) finish();
    else setIndex(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish();
        else onOpenChange(next);
      }}
    >
      <DialogContent
        className="guide-dialog sm:max-w-[520px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          window.setTimeout(() => titleRef.current?.focus(), 0);
        }}
      >
        <DialogHeader>
          <p className="text-xs font-semibold tracking-[0.12em] text-primary">
            GUIDE {index + 1} / 4
          </p>
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {step.title}
          </DialogTitle>
          <DialogDescription className="leading-6">
            {step.description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <div>
            <Button variant="ghost" onClick={finish}>
              スキップ
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => move(-1)}
              disabled={
                !availableIndexes.some((itemIndex) => itemIndex < index)
              }
            >
              戻る
            </Button>
            <Button onClick={() => move(1)}>
              {availableIndexes.some((itemIndex) => itemIndex > index)
                ? "次へ"
                : "完了"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
