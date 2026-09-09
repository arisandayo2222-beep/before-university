export type Category =
  | "programming"
  | "ai"
  | "creative"
  | "learning"
  | "law"
  | "travel"
  | "relationship"
  | "money"
  | "health"
  | "life";

export type Priority = "high" | "medium" | "low";
export type ThemeMode = "light" | "dark" | "system";
export type TaskStatus = "not_started" | "in_progress" | "completed";

export type CategoryDefinition = { id: Category; label: string };
export type Subtask = { id: string; title: string; completed: boolean };

export type Task = {
  id: string;
  title: string;
  description: string;
  month: string;
  category: Category;
  priority: Priority;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  dueDate: string | null;
  goalId: string | null;
  progress?: number;
  status?: TaskStatus;
  nextAction?: string;
  subtasks?: Subtask[];
  notes?: string;
  estimatedMinutes?: number;
  updatedAt?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
};

export type Goal = {
  id: string;
  title: string;
  titleJa: string;
  description: string;
  category: Category;
  progress: number;
  createdAt: string;
  completedAt: string | null;
  notes: string;
  targetMonth?: string | null;
};

export type MonthReview = {
  accomplished: string;
  memorable: string;
  next: string;
  notes: string;
};

export type RoadmapMonth = {
  id: string;
  year: number;
  month: number;
  label: string;
  short: string;
  theme: string;
  mainFocus: string;
  notes: string;
  review: MonthReview;
};

export type Memory = {
  id: string;
  title: string;
  description: string;
  date: string;
  relatedGoal: string | null;
  relatedTask: string | null;
  imageUrl?: string | null;
};

export type RoadmapSettings = {
  theme: ThemeMode;
  roadmapId: string;
  roadmapName: string;
  eventName: string;
  eventDescription: string;
  startDate: string;
  finalGoal: string;
  targetDate: string;
  weeklyCapacityMinutes: number | null;
  themeColor: string;
  onboardingCompleted: boolean;
  guideCompleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RoadmapData = {
  version: 2;
  tasks: Task[];
  goals: Goal[];
  months: RoadmapMonth[];
  memories: Memory[];
  categories: CategoryDefinition[];
  settings: RoadmapSettings;
};

export const CATEGORY_META: Record<
  Category,
  { label: string; icon: string; className: string }
> = {
  programming: {
    label: "プログラミング",
    icon: "P",
    className: "category-programming",
  },
  ai: { label: "AI", icon: "AI", className: "category-ai" },
  creative: { label: "制作", icon: "C", className: "category-creative" },
  learning: { label: "学習", icon: "L", className: "category-learning" },
  law: { label: "法学", icon: "法", className: "category-law" },
  travel: { label: "旅行", icon: "T", className: "category-travel" },
  relationship: {
    label: "思い出",
    icon: "M",
    className: "category-relationship",
  },
  money: { label: "お金", icon: "¥", className: "category-money" },
  health: { label: "運動", icon: "H", className: "category-health" },
  life: { label: "生活", icon: "G", className: "category-life" },
};

export const DEFAULT_CATEGORIES: CategoryDefinition[] = (
  Object.keys(CATEGORY_META) as Category[]
).map((id) => ({ id, label: CATEGORY_META[id].label }));

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
export const DEFAULT_TARGET_DATE = "2027-04-01";
export const ROADMAP_START = new Date("2026-09-01T00:00:00");
export const ROADMAP_END = new Date(`${DEFAULT_TARGET_DATE}T00:00:00`);

const MONTH_LABELS = [
  ["January", "JAN"],
  ["February", "FEB"],
  ["March", "MAR"],
  ["April", "APR"],
  ["May", "MAY"],
  ["June", "JUN"],
  ["July", "JUL"],
  ["August", "AUG"],
  ["September", "SEP"],
  ["October", "OCT"],
  ["November", "NOV"],
  ["December", "DEC"],
] as const;

const emptyReview = (): MonthReview => ({
  accomplished: "",
  memorable: "",
  next: "",
  notes: "",
});
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function createRoadmapMonths(
  startDate: string,
  targetDate: string,
): RoadmapMonth[] {
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00`);
  const end = new Date(`${targetDate.slice(0, 7)}-01T00:00:00`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  )
    return [];
  const months: RoadmapMonth[] = [];
  const cursor = new Date(start);
  while (cursor <= end && months.length < 60) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    const [label, short] = MONTH_LABELS[month - 1];
    const isGoal = year === end.getFullYear() && month === end.getMonth() + 1;
    months.push({
      id: `${year}-${String(month).padStart(2, "0")}`,
      year,
      month,
      label,
      short,
      theme: isGoal ? "Goal" : "予定を決める",
      mainFocus: isGoal
        ? "目標日までの歩みを振り返る"
        : "この月に進めたいことを決める",
      notes: "",
      review: emptyReview(),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export type NewRoadmapOptions = {
  roadmapId?: string;
  roadmapName?: string;
  eventName?: string;
  eventDescription?: string;
  finalGoal?: string;
  targetDate?: string;
  startDate?: string;
  weeklyCapacityMinutes?: number | null;
  themeColor?: string;
  onboardingCompleted?: boolean;
  guideCompleted?: boolean;
  theme?: ThemeMode;
};

export function createEmptyData(options: NewRoadmapOptions = {}): RoadmapData {
  const today = options.startDate ?? dateKey(new Date());
  const targetDate = options.targetDate ?? DEFAULT_TARGET_DATE;
  const now = new Date().toISOString();
  return {
    version: 2,
    tasks: [],
    goals: [],
    months: createRoadmapMonths(today, targetDate),
    memories: [],
    categories: DEFAULT_CATEGORIES.map((item) => ({ ...item })),
    settings: {
      theme: options.theme ?? "system",
      roadmapId:
        options.roadmapId ??
        `roadmap-${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
      roadmapName: options.roadmapName?.trim() || "Before University",
      eventName: options.eventName?.trim() || "大学入学",
      eventDescription: options.eventDescription?.trim() || "",
      startDate: today,
      finalGoal:
        options.finalGoal?.trim() || "大学入学までに、やりたいことを実現する",
      targetDate,
      weeklyCapacityMinutes: options.weeklyCapacityMinutes ?? null,
      themeColor: options.themeColor ?? "blue",
      onboardingCompleted: options.onboardingCompleted ?? false,
      guideCompleted: options.guideCompleted ?? false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function createSampleData(options: NewRoadmapOptions = {}): RoadmapData {
  const data = createEmptyData({ ...options, onboardingCompleted: true });
  const firstMonth = data.months[0]?.id ?? DEFAULT_TARGET_DATE.slice(0, 7);
  const createdAt = dateKey(new Date());
  data.goals = [
    {
      id: "sample-goal-learning",
      title: "Learn Something New",
      titleJa: "新しいことを学ぶ",
      description: "興味のあるテーマを小さく学び始める。",
      category: "learning",
      progress: 0,
      createdAt,
      completedAt: null,
      notes: "",
      targetMonth: firstMonth,
    },
    {
      id: "sample-goal-creative",
      title: "Create a Small Project",
      titleJa: "小さな作品を作る",
      description: "短時間で試せる作品を一つ形にする。",
      category: "creative",
      progress: 0,
      createdAt,
      completedAt: null,
      notes: "",
      targetMonth: firstMonth,
    },
  ];
  data.tasks = [
    {
      id: "sample-task-learning",
      title: "興味のある本を1章読む",
      description: "気になっている分野の入門書から始める。",
      month: firstMonth,
      category: "learning",
      priority: "medium",
      completed: false,
      completedAt: null,
      createdAt,
      dueDate: null,
      goalId: "sample-goal-learning",
      progress: 0,
      status: "not_started",
      nextAction: "読む本を1冊決める",
    },
    {
      id: "sample-task-creative",
      title: "作品のアイデアを3行で書く",
      description: "完成形ではなく、最初の試作に必要な内容を整理する。",
      month: firstMonth,
      category: "creative",
      priority: "high",
      completed: false,
      completedAt: null,
      createdAt,
      dueDate: null,
      goalId: "sample-goal-creative",
      progress: 0,
      status: "not_started",
      nextAction: "メモを開いて題名を書く",
    },
  ];
  return data;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isCategory = (value: unknown): value is Category =>
  typeof value === "string" && value in CATEGORY_META;
const isTheme = (value: unknown): value is ThemeMode =>
  value === "light" || value === "dark" || value === "system";

export function isRoadmapData(value: unknown): value is RoadmapData {
  if (!isObject(value) || value.version !== 2) return false;
  if (
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.goals) ||
    !Array.isArray(value.months) ||
    !Array.isArray(value.memories) ||
    !Array.isArray(value.categories)
  )
    return false;
  if (!isObject(value.settings) || !isTheme(value.settings.theme)) return false;
  return (
    typeof value.settings.roadmapId === "string" &&
    typeof value.settings.roadmapName === "string" &&
    typeof value.settings.eventName === "string" &&
    typeof value.settings.eventDescription === "string" &&
    typeof value.settings.startDate === "string" &&
    typeof value.settings.finalGoal === "string" &&
    typeof value.settings.targetDate === "string" &&
    (value.settings.weeklyCapacityMinutes === null ||
      typeof value.settings.weeklyCapacityMinutes === "number") &&
    typeof value.settings.themeColor === "string" &&
    typeof value.settings.onboardingCompleted === "boolean" &&
    typeof value.settings.guideCompleted === "boolean" &&
    value.tasks.every(
      (task) =>
        isObject(task) &&
        typeof task.id === "string" &&
        typeof task.title === "string" &&
        typeof task.month === "string" &&
        isCategory(task.category) &&
        typeof task.completed === "boolean",
    ) &&
    value.goals.every(
      (goal) =>
        isObject(goal) &&
        typeof goal.id === "string" &&
        typeof goal.title === "string" &&
        typeof goal.titleJa === "string" &&
        isCategory(goal.category),
    ) &&
    value.months.every(
      (month) =>
        isObject(month) &&
        typeof month.id === "string" &&
        typeof month.year === "number" &&
        typeof month.month === "number" &&
        typeof month.theme === "string" &&
        isObject(month.review),
    ) &&
    value.memories.every(
      (memory) =>
        isObject(memory) &&
        typeof memory.id === "string" &&
        typeof memory.title === "string" &&
        typeof memory.date === "string",
    ) &&
    value.categories.every(
      (category) =>
        isObject(category) &&
        isCategory(category.id) &&
        typeof category.label === "string",
    )
  );
}

export function migrateRoadmapData(value: unknown): RoadmapData | null {
  if (isRoadmapData(value)) return value;
  if (
    isObject(value) &&
    value.version === 2 &&
    Array.isArray(value.tasks) &&
    Array.isArray(value.goals) &&
    Array.isArray(value.months) &&
    Array.isArray(value.memories) &&
    Array.isArray(value.categories) &&
    isObject(value.settings) &&
    isTheme(value.settings.theme) &&
    value.months.length
  ) {
    const firstMonth = value.months[0] as RoadmapMonth;
    const lastMonth = value.months[value.months.length - 1] as RoadmapMonth;
    const startDate = `${firstMonth.year}-${String(firstMonth.month).padStart(2, "0")}-01`;
    const targetDate =
      typeof value.settings.targetDate === "string"
        ? value.settings.targetDate
        : `${lastMonth.year}-${String(lastMonth.month).padStart(2, "0")}-01`;
    const now = new Date().toISOString();
    const upgraded = {
      ...value,
      settings: {
        ...value.settings,
        roadmapId:
          typeof value.settings.roadmapId === "string"
            ? value.settings.roadmapId
            : `roadmap-${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now()}`,
        roadmapName:
          typeof value.settings.roadmapName === "string"
            ? value.settings.roadmapName
            : "Before University",
        eventName:
          typeof value.settings.eventName === "string"
            ? value.settings.eventName
            : "大学入学",
        eventDescription:
          typeof value.settings.eventDescription === "string"
            ? value.settings.eventDescription
            : "",
        startDate:
          typeof value.settings.startDate === "string"
            ? value.settings.startDate
            : startDate,
        finalGoal:
          typeof value.settings.finalGoal === "string"
            ? value.settings.finalGoal
            : "大切な日までに、やりたいことを実現する",
        targetDate,
        weeklyCapacityMinutes:
          typeof value.settings.weeklyCapacityMinutes === "number"
            ? value.settings.weeklyCapacityMinutes
            : null,
        themeColor:
          typeof value.settings.themeColor === "string"
            ? value.settings.themeColor
            : "blue",
        onboardingCompleted:
          typeof value.settings.onboardingCompleted === "boolean"
            ? value.settings.onboardingCompleted
            : true,
        guideCompleted:
          typeof value.settings.guideCompleted === "boolean"
            ? value.settings.guideCompleted
            : true,
        createdAt:
          typeof value.settings.createdAt === "string"
            ? value.settings.createdAt
            : now,
        updatedAt: now,
      },
    };
    return isRoadmapData(upgraded) ? upgraded : null;
  }
  if (!isObject(value) || value.version !== 1) return null;
  if (
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.goals) ||
    !Array.isArray(value.months) ||
    !Array.isArray(value.memories) ||
    !isObject(value.settings) ||
    !isTheme(value.settings.theme)
  )
    return null;
  const legacy = value as unknown as {
    tasks: Task[];
    goals: Goal[];
    months: RoadmapMonth[];
    memories: Memory[];
    settings: { theme: ThemeMode };
  };
  if (!legacy.months.length) return null;
  const lastMonth = legacy.months[legacy.months.length - 1];
  const targetDate = `${lastMonth.year}-${String(lastMonth.month).padStart(2, "0")}-01`;
  const firstMonth = legacy.months[0];
  const startDate = `${firstMonth.year}-${String(firstMonth.month).padStart(2, "0")}-01`;
  const now = new Date().toISOString();
  const migrated: RoadmapData = {
    version: 2,
    tasks: legacy.tasks,
    goals: legacy.goals,
    months: legacy.months,
    memories: legacy.memories,
    categories: DEFAULT_CATEGORIES.map((item) => ({ ...item })),
    settings: {
      theme: legacy.settings.theme,
      roadmapId: `roadmap-${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now()}`,
      roadmapName: "Before University",
      eventName: "大学入学",
      eventDescription: "",
      startDate,
      finalGoal: "大学入学までに、やりたいことを実現する",
      targetDate,
      weeklyCapacityMinutes: null,
      themeColor: "blue",
      onboardingCompleted: true,
      guideCompleted: true,
      createdAt: now,
      updatedAt: now,
    },
  };
  return isRoadmapData(migrated) ? migrated : null;
}
