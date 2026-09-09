import type { Category, Goal, RoadmapMonth, Task } from "./roadmap-data";

export type NextStepPromptContext = {
  goal?: Goal | null;
  month?: RoadmapMonth | null;
  categoryName: string;
  status: string;
  progress: number;
  finalGoal?: string;
  targetDate?: string;
};

export type CopyAdapters = {
  writeText?: (text: string) => Promise<void>;
  selectText: () => void;
  legacyCopy: () => boolean;
};

const priorityLabels = {
  high: "高",
  medium: "中",
  low: "低",
} as const;

const categoryGuidance: Record<Category, string[]> = {
  programming: [
    "使用するファイル、画面、機能など、最初に触る対象を明確にする",
    "大きな機能は、動作確認できる最小単位まで分解する",
    "コード全体を一度に書き直す提案は避ける",
    "実装後の確認方法も短く示す",
  ],
  ai: [
    "使用するファイル、画面、機能など、最初に触る対象を明確にする",
    "大きな機能は、動作確認できる最小単位まで分解する",
    "コード全体を一度に書き直す提案は避ける",
    "実装後の確認方法も短く示す",
  ],
  learning: [
    "今回読む範囲や学ぶテーマを明確にする",
    "読むだけでなく、説明・要約・問題演習など確認行動を含める",
    "一度に広い範囲を扱わない",
  ],
  law: [
    "今回読む範囲や学ぶテーマを明確にする",
    "読むだけでなく、説明・要約・問題演習など確認行動を含める",
    "一度に広い範囲を扱わない",
  ],
  creative: [
    "最初に作る素材や編集する箇所を1つに絞る",
    "完璧な完成品ではなく、確認できる小さな試作を優先する",
    "使用する素材やソフト上の操作を具体的にする",
  ],
  travel: [
    "最初に調べる条件や比較対象を明確にする",
    "予約や購入を勝手に前提としない",
    "日程、予算、交通手段などから、最初に決める項目を1つ選ぶ",
  ],
  relationship: [
    "最初に決める体験や連絡など、無理なく始められる行動を1つに絞る",
    "予約や購入を勝手に前提としない",
    "本人と相手の都合や安全を尊重した提案にする",
  ],
  money: [
    "高校生でも安全に実行できる情報整理や比較を優先する",
    "契約、購入、投資などを即座に行わせない",
    "必要に応じて保護者や公的な情報源への確認を含める",
  ],
  life: [
    "高校生でも安全に実行できる情報整理や比較を優先する",
    "契約や購入を即座に行わせない",
    "大学準備に関わる場合は、必要に応じて保護者や学校、公的な情報源への確認を含める",
  ],
  health: [
    "健康維持と安全な習慣づくりを目的にする",
    "体型への否定的な評価を含めない",
    "過度な運動、極端な食事制限、カロリー制限を提案しない",
    "体調に異常がある場合は無理に続けないよう伝える",
  ],
};

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getDueDateDistance(dueDate: string, now = new Date()) {
  const [year, month, day] = dueDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  const difference = Math.round(
    (Date.UTC(year, month - 1, day) - startOfUtcDay(now)) / 86_400_000,
  );
  if (difference > 0) return `あと${difference}日`;
  if (difference === 0) return "今日";
  return `期限を${Math.abs(difference)}日超過`;
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

function section(label: string, value?: string | null) {
  const normalized = value?.trim();
  return normalized ? `【${label}】\n${normalized}` : null;
}

export function buildNextStepPrompt(
  task: Task,
  context: NextStepPromptContext,
  now = new Date(),
) {
  const completedSubtasks = task.subtasks
    ?.filter((item) => item.completed)
    .map((item) => `- ${item.title}`)
    .join("\n");
  const remainingSubtasks = task.subtasks
    ?.filter((item) => !item.completed)
    .map((item) => `- ${item.title}`)
    .join("\n");
  const goalTitle = context.goal
    ? context.goal.titleJa
      ? `${context.goal.titleJa}（${context.goal.title}）`
      : context.goal.title
    : null;
  const targetMonth = context.month
    ? `${context.month.year}年${context.month.month}月（${context.month.label}）`
    : task.month;
  const dueDistance = task.dueDate
    ? getDueDateDistance(task.dueDate, now)
    : null;
  const completed =
    context.progress >= 100 || task.completed || task.status === "completed";
  const details = [
    section("大目標", goalTitle),
    section("カテゴリ", context.categoryName),
    section("対象月", targetMonth),
    section("タスク", task.title),
    section("タスクの説明", task.description),
    section("現在の状態", context.status),
    section("現在の進捗", `${context.progress}%`),
    section("期限", task.dueDate ? formatDate(task.dueDate) : null),
    section("期限まで", dueDistance),
    section("優先度", priorityLabels[task.priority]),
    section("完了済みの内容", completedSubtasks),
    section("残っている内容", remainingSubtasks),
    section("メモ", task.notes),
    section(
      "想定所要時間",
      typeof task.estimatedMinutes === "number"
        ? `${task.estimatedMinutes}分`
        : null,
    ),
    section(
      "最終更新日",
      task.updatedAt ? formatDate(task.updatedAt.slice(0, 10)) : null,
    ),
  ].filter(Boolean);

  const request = completed
    ? "このタスクは完了済みです。新しい作業を無理に作らず、成果を残すための記録・振り返り・次へ引き継ぐ一歩を1つだけ決めてください。"
    : "この情報を踏まえて、私が今すぐ取りかかるべき「次の一歩」を1つだけ決めてください。";

  const conditions = [
    "長期的な計画や一般論ではなく、今から実行できる具体的な行動にする",
    "15〜30分程度で着手できる大きさにする",
    "やることを複数並べず、最も重要な行動を1つに絞る",
    "最初に開くもの、調べるもの、書くものなど、開始動作まで具体的に示す",
    "必要なら、その行動を3〜5個の短い手順に分ける",
    "どこまで進めたら今回の作業を完了とするか明示する",
    "情報が不足していても、質問だけで終わらず、現時点で実行できる仮の一歩を提示する",
    "高校生でも理解できる、簡潔な日本語で回答する",
    "できていないことを責めたり、不安をあおったりしない",
    "回答を長くしすぎない",
  ];

  const categoryConditions = categoryGuidance[task.category];
  const targetLabel = context.targetDate
    ? formatDate(context.targetDate)
    : null;
  const introduction = context.finalGoal?.trim()
    ? `私は、${targetLabel ? `${targetLabel}を目標日として、` : ""}「${context.finalGoal.trim()}」を目標にしたロードマップを管理しています。`
    : "私は、自分の目標を達成するためのロードマップを管理しています。";
  return [
    introduction,
    "現在取り組もうとしているタスクは次のとおりです。",
    ...details,
    request,
    `条件：\n${conditions.map((item) => `- ${item}`).join("\n")}`,
    `このタスクに合わせた補助条件：\n${categoryConditions.map((item) => `- ${item}`).join("\n")}`,
    "次の形式で回答してください。",
    "「今やること」\n1文で、実行する行動を書く。",
    "「進め方」\n必要な場合のみ、3〜5個の短い手順を書く。",
    "「完了ライン」\n今回どこまでできたら完了かを1文で書く。",
    "「最初の5分」\n作業開始直後に行う操作を1文で書く。",
  ]
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function copyTextWithFallback(
  text: string,
  adapters: CopyAdapters,
) {
  if (adapters.writeText) {
    try {
      await adapters.writeText(text);
      return "clipboard" as const;
    } catch {
      // Continue to the selection-based fallback.
    }
  }
  adapters.selectText();
  return adapters.legacyCopy() ? ("fallback" as const) : ("selected" as const);
}
