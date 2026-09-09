import {
  APP_VERSION,
  MAX_BACKUP_BYTES,
  parseBackupText as parseLegacyBackup,
} from "./local-data";
import {
  CATEGORY_META,
  createEmptyData,
  type Category,
  type Goal,
  type Memory,
  type Priority,
  type RoadmapData,
  type Subtask,
  type Task,
  type TaskStatus,
} from "./roadmap-data";

export const EVENT_BACKUP_FORMAT = "before-roadmap" as const;
export const EVENT_SCHEMA_VERSION = 2 as const;

export type EventBackup = {
  format: typeof EVENT_BACKUP_FORMAT;
  schemaVersion: typeof EVENT_SCHEMA_VERSION;
  exportedAt: string;
  appVersion: string;
  roadmap: {
    title: string;
    event: { name: string; description: string; date: string };
    startDate: string;
    weeklyCapacityMinutes: number | null;
    themeColor: string;
    categories: Array<{ id: Category; label: string }>;
    goals: Goal[];
    tasks: Task[];
    memories: Memory[];
  };
};

export type ParsedEventBackup = {
  envelope: EventBackup;
  data: RoadmapData;
  warnings: string[];
  earliestTaskDate: string | null;
  latestTaskDate: string | null;
};

const forbiddenKeys = new Set(["__proto__", "proto", "prototype", "constructor"]);
const allowedCategories = new Set(Object.keys(CATEGORY_META));
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const cleanCodeFence = (text: string) => {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : trimmed;
};

const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(`${value}T00:00:00`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getFullYear() === year &&
    parsed.getMonth() + 1 === month &&
    parsed.getDate() === day
  );
};

const validStoredDate = (value: unknown): value is string => {
  if (validDate(value)) return true;
  return (
    typeof value === "string" &&
    value.length <= 50 &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  );
};

function storedDate(
  value: unknown,
  label: string,
  fallback: string | null,
): string | null {
  const normalized = value === undefined ? fallback : value;
  if (normalized === null) return null;
  if (!validStoredDate(normalized)) throw new Error(`${label}が正しくありません`);
  return normalized;
}

function inspect(value: unknown, depth = 0, count = { value: 0 }): void {
  if (depth > 8) throw new Error("データの入れ子が深すぎます");
  count.value += 1;
  if (count.value > 30_000) throw new Error("データ量が多すぎます");
  if (typeof value === "string" && value.length > 20_000)
    throw new Error("長すぎる文字列が含まれています");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKeys.has(key)) throw new Error("安全でないキーが含まれています");
    inspect(child, depth + 1, count);
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}の形式が正しくありません`);
  return value as Record<string, unknown>;
}

function keys(record: Record<string, unknown>, allowed: string[], label: string) {
  for (const key of Object.keys(record)) {
    if (forbiddenKeys.has(key)) throw new Error("安全でないキーが含まれています");
    if (!allowed.includes(key)) throw new Error(`${label}に未対応の項目があります: ${key}`);
  }
}

function text(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()))
    throw new Error(`${label}の形式が正しくありません`);
  return value.trim();
}

const newId = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export function createEventBackup(data: RoadmapData): EventBackup {
  return {
    format: EVENT_BACKUP_FORMAT,
    schemaVersion: EVENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    roadmap: {
      title: data.settings.roadmapName,
      event: {
        name: data.settings.eventName,
        description: data.settings.eventDescription,
        date: data.settings.targetDate,
      },
      startDate: data.settings.startDate,
      weeklyCapacityMinutes: data.settings.weeklyCapacityMinutes,
      themeColor: data.settings.themeColor,
      categories: structuredClone(data.categories),
      goals: structuredClone(data.goals),
      tasks: data.tasks.map((task) => ({
        ...structuredClone(task),
        status: task.status ?? (task.completed ? "completed" : "not_started"),
        progress: task.progress ?? (task.completed ? 100 : 0),
      })),
      memories: structuredClone(data.memories),
    },
  };
}

export function downloadEventBackup(data: RoadmapData) {
  const backup = createEventBackup(data);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const safeName = data.settings.eventName.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60) || "event";
  link.download = `${safeName}-roadmap.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function legacyToModern(data: RoadmapData): ParsedEventBackup {
  const envelope = createEventBackup(data);
  return { envelope, data, warnings: [], earliestTaskDate: null, latestTaskDate: null };
}

export function parseEventBackupText(rawText: string): ParsedEventBackup {
  const source = cleanCodeFence(rawText);
  if (new Blob([source]).size > MAX_BACKUP_BYTES)
    throw new Error("JSONは2MB以下にしてください");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("正しいJSONとして読み取れませんでした");
  }
  inspect(parsed);
  const root = object(parsed, "ロードマップファイル");
  if (root.format !== EVENT_BACKUP_FORMAT) {
    try {
      return legacyToModern({
        version: 2,
        ...parseLegacyBackup(source).data,
      });
    } catch {
      throw new Error("Before Roadmapの対応ファイルではありません");
    }
  }
  keys(root, ["format", "schemaVersion", "exportedAt", "appVersion", "roadmap"], "ファイル");
  if (root.schemaVersion !== EVENT_SCHEMA_VERSION)
    throw new Error("このスキーマバージョンには対応していません");
  if (
    typeof root.exportedAt !== "string" ||
    Number.isNaN(new Date(root.exportedAt).getTime())
  )
    throw new Error("書き出し日時が正しくありません");
  text(root.appVersion, "アプリバージョン", 50, true);
  const roadmap = object(root.roadmap, "ロードマップ");
  keys(roadmap, ["title", "event", "startDate", "weeklyCapacityMinutes", "themeColor", "categories", "goals", "tasks", "memories"], "ロードマップ");
  const title = text(roadmap.title, "ロードマップ名", 200, true);
  const event = object(roadmap.event, "イベント");
  keys(event, ["name", "description", "date"], "イベント");
  const eventName = text(event.name, "イベント名", 200, true);
  const eventDescription = text(event.description ?? "", "イベントの説明", 2000);
  if (!validDate(roadmap.startDate) || !validDate(event.date))
    throw new Error("開始日またはイベント日が正しくありません");
  const startDate = roadmap.startDate;
  const eventDate = event.date;
  if (eventDate <= startDate) throw new Error("イベント日は開始日より後にしてください");
  const capacity = roadmap.weeklyCapacityMinutes;
  if (capacity !== null && capacity !== undefined &&
      (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 0 || capacity > 10_080))
    throw new Error("1週間に使える時間が正しくありません");
  const themeColor = text(roadmap.themeColor ?? "blue", "テーマカラー", 32, true);
  if (!/^[a-z0-9-]+$/i.test(themeColor)) throw new Error("テーマカラーが正しくありません");

  if (!Array.isArray(roadmap.categories) || roadmap.categories.length > 50)
    throw new Error("カテゴリ件数が正しくありません");
  const categoryIds = new Set<string>();
  const categories = roadmap.categories.map((value) => {
    const item = object(value, "カテゴリ");
    keys(item, ["id", "label"], "カテゴリ");
    if (typeof item.id !== "string" || !allowedCategories.has(item.id))
      throw new Error("カテゴリIDが正しくありません");
    if (categoryIds.has(item.id)) throw new Error("カテゴリIDが重複しています");
    categoryIds.add(item.id);
    return { id: item.id as Category, label: text(item.label, "カテゴリ名", 100, true) };
  });
  if (!categories.length) throw new Error("カテゴリを1件以上含めてください");
  if (!Array.isArray(roadmap.goals) || roadmap.goals.length > 1000)
    throw new Error("目標件数が多すぎます");
  if (!Array.isArray(roadmap.tasks) || roadmap.tasks.length > 5000)
    throw new Error("タスク件数が多すぎます");
  if (roadmap.memories !== undefined && (!Array.isArray(roadmap.memories) || roadmap.memories.length > 2000))
    throw new Error("記録件数が多すぎます");

  const goalMap = new Map<string, string>();
  const goals: Goal[] = roadmap.goals.map((value) => {
    const item = object(value, "目標");
    keys(item, ["id", "title", "titleJa", "description", "category", "progress", "createdAt", "completedAt", "notes", "targetMonth"], "目標");
    const externalId = text(item.id, "目標ID", 200, true);
    if (goalMap.has(externalId)) throw new Error("目標IDが重複しています");
    if (typeof item.category !== "string" || !allowedCategories.has(item.category))
      throw new Error("目標のカテゴリが正しくありません");
    const internalId = newId("goal");
    goalMap.set(externalId, internalId);
    const progress = Number(item.progress ?? 0);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100)
      throw new Error("目標の進捗が正しくありません");
    const createdAt = storedDate(item.createdAt, "目標の作成日", startDate) as string;
    const completedAt = storedDate(item.completedAt, "目標の完了日", null);
    return {
      id: internalId,
      title: text(item.title, "目標名", 300, true),
      titleJa: text(item.titleJa ?? item.title, "目標名", 300, true),
      description: text(item.description ?? "", "目標の説明", 5000),
      category: item.category as Category,
      progress,
      createdAt,
      completedAt,
      notes: text(item.notes ?? "", "目標のメモ", 10_000),
      targetMonth: typeof item.targetMonth === "string" && /^\d{4}-\d{2}$/.test(item.targetMonth) ? item.targetMonth : null,
    };
  });

  const taskMap = new Map<string, string>();
  const subtaskIds = new Set<string>();
  const dueDates: string[] = [];
  const warnings: string[] = [];
  const tasks: Task[] = roadmap.tasks.map((value) => {
    const item = object(value, "タスク");
    keys(item, ["id", "title", "description", "month", "category", "priority", "completed", "completedAt", "createdAt", "dueDate", "goalId", "progress", "status", "nextAction", "subtasks", "notes", "estimatedMinutes", "updatedAt", "archivedAt", "deletedAt"], "タスク");
    const externalId = text(item.id, "タスクID", 200, true);
    if (taskMap.has(externalId)) throw new Error("タスクIDが重複しています");
    if (typeof item.category !== "string" || !allowedCategories.has(item.category))
      throw new Error("タスクのカテゴリが正しくありません");
    const priority = String(item.priority ?? "medium") as Priority;
    if (!(["high", "medium", "low"] as string[]).includes(priority))
      throw new Error("タスクの優先度が正しくありません");
    const status = String(item.status ?? "not_started") as TaskStatus;
    if (!(["not_started", "in_progress", "completed"] as string[]).includes(status))
      throw new Error("タスクの状態が正しくありません");
    const progress = Number(item.progress ?? 0);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100)
      throw new Error("タスクの進捗が正しくありません");
    if (status === "not_started" && progress !== 0)
      throw new Error("未着手タスクの進捗は0%にしてください");
    if (item.completed !== undefined && Boolean(item.completed) !== (status === "completed"))
      throw new Error("タスクの完了状態とステータスが一致しません");
    const dueDate = item.dueDate === null || item.dueDate === undefined || item.dueDate === "" ? null : item.dueDate;
    if (dueDate !== null && !validDate(dueDate)) throw new Error("タスク期限が正しくありません");
    if (dueDate) {
      dueDates.push(dueDate);
      if (dueDate > eventDate) warnings.push(`「${String(item.title).slice(0, 60)}」の期限がイベント日より後です`);
    }
    const goalId =
      item.goalId === null || item.goalId === undefined
        ? null
        : (goalMap.get(String(item.goalId)) ?? null);
    if (item.goalId && !goalId) throw new Error("タスクの参照先目標が存在しません");
    const subtasks: Subtask[] | undefined = item.subtasks === undefined ? undefined : (() => {
      if (!Array.isArray(item.subtasks) || item.subtasks.length > 100) throw new Error("サブタスク件数が正しくありません");
      return item.subtasks.map((raw) => {
        const sub = object(raw, "サブタスク");
        keys(sub, ["id", "title", "completed"], "サブタスク");
        const externalSubtaskId = text(sub.id, "サブタスクID", 200, true);
        if (subtaskIds.has(externalSubtaskId)) throw new Error("サブタスクIDが重複しています");
        subtaskIds.add(externalSubtaskId);
        if (typeof sub.completed !== "boolean") throw new Error("サブタスクの完了状態が正しくありません");
        return { id: newId("subtask"), title: text(sub.title, "サブタスク名", 300, true), completed: sub.completed };
      });
    })();
    const internalId = newId("task");
    taskMap.set(externalId, internalId);
    const createdAt = storedDate(item.createdAt, "タスクの作成日", startDate) as string;
    const completedAt = storedDate(item.completedAt, "タスクの完了日", null);
    const updatedAt = storedDate(item.updatedAt, "タスクの更新日", null);
    const archivedAt = storedDate(item.archivedAt, "タスクのアーカイブ日", null);
    const deletedAt = storedDate(item.deletedAt, "タスクの削除日", null);
    return {
      id: internalId,
      title: text(item.title, "タスク名", 300, true),
      description: text(item.description ?? "", "タスクの説明", 5000),
      month: dueDate?.slice(0, 7) ?? (typeof item.month === "string" && /^\d{4}-\d{2}$/.test(item.month) ? item.month : startDate.slice(0, 7)),
      category: item.category as Category,
      priority,
      completed: status === "completed",
      completedAt: status === "completed" ? completedAt : null,
      createdAt,
      dueDate,
      goalId,
      progress,
      status,
      nextAction: item.nextAction === undefined ? undefined : text(item.nextAction, "次の一歩", 1000),
      subtasks,
      notes: item.notes === undefined ? undefined : text(item.notes, "タスクのメモ", 10_000),
      estimatedMinutes: item.estimatedMinutes === undefined ? undefined : Number(item.estimatedMinutes),
      updatedAt,
      archivedAt,
      deletedAt,
    };
  });
  for (const task of tasks) {
    if (task.estimatedMinutes !== undefined && (!Number.isInteger(task.estimatedMinutes) || task.estimatedMinutes < 0 || task.estimatedMinutes > 100_000))
      throw new Error("タスクの想定時間が正しくありません");
  }

  const memories: Memory[] = [];
  const memoryIds = new Set<string>();
  if (Array.isArray(roadmap.memories)) {
    for (const value of roadmap.memories) {
      const item = object(value, "記録");
      keys(item, ["id", "title", "description", "date", "relatedGoal", "relatedTask", "imageUrl"], "記録");
      const externalMemoryId = text(item.id, "記録ID", 200, true);
      if (memoryIds.has(externalMemoryId)) throw new Error("記録IDが重複しています");
      memoryIds.add(externalMemoryId);
      if (!validDate(item.date)) throw new Error("記録の日付が正しくありません");
      if (item.imageUrl) throw new Error("外部画像参照は読み込めません");
      const relatedGoal = item.relatedGoal ? goalMap.get(String(item.relatedGoal)) ?? null : null;
      const relatedTask = item.relatedTask ? taskMap.get(String(item.relatedTask)) ?? null : null;
      if (item.relatedGoal && !relatedGoal) throw new Error("記録の参照先目標が存在しません");
      if (item.relatedTask && !relatedTask) throw new Error("記録の参照先タスクが存在しません");
      memories.push({
        id: newId("memory"),
        title: text(item.title, "記録名", 300, true),
        description: text(item.description ?? "", "記録の説明", 10_000),
        date: item.date,
        relatedGoal,
        relatedTask,
        imageUrl: null,
      });
    }
  }
  const data = createEmptyData({
    roadmapName: title,
    eventName,
    eventDescription,
    finalGoal: eventDescription || `${eventName}までに、やりたいことを実現する`,
    startDate,
    targetDate: eventDate,
    weeklyCapacityMinutes: capacity == null ? null : capacity,
    themeColor,
    onboardingCompleted: true,
    guideCompleted: false,
  });
  data.categories = categories;
  data.goals = goals;
  data.tasks = tasks;
  data.memories = memories;
  const envelope = createEventBackup(data);
  return {
    envelope,
    data,
    warnings: [...new Set(warnings)],
    earliestTaskDate: dueDates.sort()[0] ?? null,
    latestTaskDate: dueDates.sort().at(-1) ?? null,
  };
}

export const CURRENT_IMPORT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Before Roadmap import",
  type: "object",
  additionalProperties: false,
  $defs: {
    categoryId: {
      type: "string",
      enum: [
        "programming", "ai", "creative", "learning", "law",
        "travel", "relationship", "money", "health", "life",
      ],
    },
    nullableDate: { type: ["string", "null"], format: "date" },
    nullableDateTime: { type: ["string", "null"], format: "date-time" },
    category: {
      type: "object",
      additionalProperties: false,
      required: ["id", "label"],
      properties: {
        id: { $ref: "#/$defs/categoryId" },
        label: { type: "string", minLength: 1, maxLength: 100 },
      },
    },
    goal: {
      type: "object",
      additionalProperties: false,
      required: [
        "id", "title", "titleJa", "description", "category", "progress",
        "createdAt", "completedAt", "notes", "targetMonth",
      ],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 200 },
        title: { type: "string", minLength: 1, maxLength: 300 },
        titleJa: { type: "string", minLength: 1, maxLength: 300 },
        description: { type: "string", maxLength: 5000 },
        category: { $ref: "#/$defs/categoryId" },
        progress: { type: "number", minimum: 0, maximum: 100 },
        createdAt: { type: "string", format: "date" },
        completedAt: { $ref: "#/$defs/nullableDate" },
        notes: { type: "string", maxLength: 10000 },
        targetMonth: {
          type: ["string", "null"],
          pattern: "^[0-9]{4}-[0-9]{2}$",
        },
      },
    },
    subtask: {
      type: "object",
      additionalProperties: false,
      required: ["id", "title", "completed"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 200 },
        title: { type: "string", minLength: 1, maxLength: 300 },
        completed: { type: "boolean" },
      },
    },
    task: {
      type: "object",
      additionalProperties: false,
      required: [
        "id", "title", "description", "month", "category", "priority",
        "completed", "completedAt", "createdAt", "dueDate", "goalId",
        "progress", "status",
      ],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 200 },
        title: { type: "string", minLength: 1, maxLength: 300 },
        description: { type: "string", maxLength: 5000 },
        month: { type: "string", pattern: "^[0-9]{4}-[0-9]{2}$" },
        category: { $ref: "#/$defs/categoryId" },
        priority: { enum: ["high", "medium", "low"] },
        completed: { type: "boolean" },
        completedAt: { $ref: "#/$defs/nullableDate" },
        createdAt: { type: "string", format: "date" },
        dueDate: { $ref: "#/$defs/nullableDate" },
        goalId: { type: ["string", "null"], maxLength: 200 },
        progress: { type: "number", minimum: 0, maximum: 100 },
        status: { enum: ["not_started", "in_progress", "completed"] },
        nextAction: { type: "string", maxLength: 1000 },
        subtasks: {
          type: "array",
          maxItems: 100,
          items: { $ref: "#/$defs/subtask" },
        },
        notes: { type: "string", maxLength: 10000 },
        estimatedMinutes: { type: "integer", minimum: 0, maximum: 100000 },
        updatedAt: { $ref: "#/$defs/nullableDateTime" },
        archivedAt: { $ref: "#/$defs/nullableDateTime" },
        deletedAt: { $ref: "#/$defs/nullableDateTime" },
      },
    },
    memory: {
      type: "object",
      additionalProperties: false,
      required: [
        "id", "title", "description", "date", "relatedGoal", "relatedTask",
      ],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 200 },
        title: { type: "string", minLength: 1, maxLength: 300 },
        description: { type: "string", maxLength: 10000 },
        date: { type: "string", format: "date" },
        relatedGoal: { type: ["string", "null"], maxLength: 200 },
        relatedTask: { type: ["string", "null"], maxLength: 200 },
      },
    },
  },
  required: ["format", "schemaVersion", "exportedAt", "appVersion", "roadmap"],
  properties: {
    format: { const: EVENT_BACKUP_FORMAT },
    schemaVersion: { const: EVENT_SCHEMA_VERSION },
    exportedAt: { type: "string", format: "date-time" },
    appVersion: { type: "string", maxLength: 50 },
    roadmap: {
      type: "object",
      additionalProperties: false,
      required: ["title", "event", "startDate", "weeklyCapacityMinutes", "themeColor", "categories", "goals", "tasks", "memories"],
      properties: {
        title: { type: "string", minLength: 1, maxLength: 200 },
        event: {
          type: "object",
          additionalProperties: false,
          required: ["name", "description", "date"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 200 },
            description: { type: "string", maxLength: 2000 },
            date: { type: "string", format: "date" },
          },
        },
        startDate: { type: "string", format: "date" },
        weeklyCapacityMinutes: { type: ["integer", "null"], minimum: 0, maximum: 10080 },
        themeColor: { type: "string", pattern: "^[a-zA-Z0-9-]+$", maxLength: 32 },
        categories: {
          type: "array", minItems: 1, maxItems: 50,
          items: { $ref: "#/$defs/category" },
        },
        goals: {
          type: "array", maxItems: 1000,
          items: { $ref: "#/$defs/goal" },
        },
        tasks: {
          type: "array", maxItems: 5000,
          items: { $ref: "#/$defs/task" },
        },
        memories: {
          type: "array", maxItems: 2000,
          items: { $ref: "#/$defs/memory" },
        },
      },
    },
  },
} as const;

export function buildRoadmapAIPrompt() {
  return `あなたは、目標整理と行動計画づくりを支援するロードマップ設計アシスタントです。

私が「特定の日までに達成したいこと」を整理し、最終的にロードマップ管理サイトへ読み込めるJSONファイルを作成してください。

考えが曖昧な可能性があるため、最初から内容を決めつけないでください。私へ質問を1問ずつ、最大8問程度で行い、イベント名・日付・実現したい状態・現在地・優先順位・週の利用可能時間・忙しい時期・予算や道具・経験・無理のない作業量を整理してください。名前、学校名、住所、連絡先など不要な個人情報は質問しないでください。曖昧な回答には具体例を2〜4個示してください。

回答後はイベント日から逆算し、成果を大目標にし、15〜120分で着手できる具体的なタスクへ分解してください。各タスクに期限、優先度、想定時間、完了条件、必要なサブタスクを設定し、依存順・利用可能時間・予備日を考慮してください。イベント日より後へタスクを置かず、初期状態は未着手・進捗0%にしてください。

JSON作成前に、イベント名・日付・大目標・カテゴリ・時系列・タスク数・週の想定時間・優先項目・余裕不足を人が読める形で示し、「この内容でファイルを作成してよいですか？」と確認してください。

承認後、次のJSON Schemaへ厳密に従うUTF-8 JSONを「イベント名-roadmap.json」として作成してください。添付できない場合だけJSON全体を1つのコードブロックで出力し、省略しないでください。IDはファイル内で重複させず、goalIdの参照先を存在させてください。HTMLや実行コード、不要な個人情報を含めないでください。

JSON Schema:
${JSON.stringify(CURRENT_IMPORT_SCHEMA, null, 2)}

それでは、最初の質問を1つだけしてください。`;
}
