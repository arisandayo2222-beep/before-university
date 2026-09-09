import {
  CATEGORY_META,
  type Category,
  type Goal,
  type Memory,
  type RoadmapData,
  type RoadmapMonth,
  type RoadmapSettings,
  type Task,
  isRoadmapData,
  migrateRoadmapData,
} from "./roadmap-data";

export const LEGACY_STORAGE_KEY = "before-university-roadmap-v1";
export const DB_NAME = "before-university-local";
export const DB_VERSION = 1;
export const APP_VERSION = "4.0.0";
export const BACKUP_FORMAT = "before-university-roadmap";
export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
const LEGACY_THEME_STORAGE_KEY = "theme";

const ROADMAP_STORE = "roadmap";
const DRAFT_STORE = "drafts";
const ROADMAP_KEY = "current";
const ONBOARDING_DRAFT_KEY = "onboarding";
const FORBIDDEN_KEYS = new Set([
  "__proto__",
  "proto",
  "prototype",
  "constructor",
]);

export type SaveStatus = "loading" | "saving" | "saved" | "error";
export type ImportMode = "new" | "merge" | "replace";

export type RoadmapWorkspace = {
  workspaceVersion: 1;
  activeRoadmapId: string;
  roadmaps: RoadmapData[];
  updatedAt: string;
};

export type BackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  appVersion: string;
  data: {
    goals: Goal[];
    categories: RoadmapData["categories"];
    months: RoadmapMonth[];
    tasks: Task[];
    memories: Memory[];
    settings: RoadmapSettings;
  };
};

export type OnboardingGoalDraft = {
  title: string;
  category: Category | "undecided";
  targetMonth: string;
  note: string;
};

export type OnboardingDraft = {
  step: number;
  roadmapName: string;
  eventName: string;
  startDate: string;
  finalGoal: string;
  targetDate: string;
  goals: OnboardingGoalDraft[];
  updatedAt: string;
};

export type InitialLoadResult = {
  data: RoadmapData | null;
  workspace: RoadmapWorkspace | null;
  source: "indexeddb" | "migrated" | "empty";
  migrationWarning?: string;
  draft: OnboardingDraft | null;
};

export function createWorkspace(data: RoadmapData): RoadmapWorkspace {
  return {
    workspaceVersion: 1,
    activeRoadmapId: data.settings.roadmapId,
    roadmaps: [data],
    updatedAt: new Date().toISOString(),
  };
}

export function isRoadmapWorkspace(value: unknown): value is RoadmapWorkspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const workspace = value as Record<string, unknown>;
  return (
    workspace.workspaceVersion === 1 &&
    typeof workspace.activeRoadmapId === "string" &&
    Array.isArray(workspace.roadmaps) &&
    workspace.roadmaps.length > 0 &&
    workspace.roadmaps.length <= 100 &&
    workspace.roadmaps.every((roadmap) => Boolean(migrateRoadmapData(roadmap)))
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("このブラウザでは端末保存を利用できません"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ROADMAP_STORE))
        database.createObjectStore(ROADMAP_STORE);
      if (!database.objectStoreNames.contains(DRAFT_STORE))
        database.createObjectStore(DRAFT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("端末の保存領域を開けませんでした"));
    request.onblocked = () =>
      reject(new Error("別のタブを閉じてから、もう一度お試しください"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("端末の保存処理に失敗しました"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(new Error("端末の保存処理に失敗しました"));
    transaction.onabort = () =>
      reject(new Error("端末の保存処理が中止されました"));
  });
}

async function readStore<T>(
  storeName: string,
  key: string,
): Promise<T | undefined> {
  const database = await openDatabase();
  try {
    return (await requestResult(
      database
        .transaction(storeName, "readonly")
        .objectStore(storeName)
        .get(key),
    )) as T | undefined;
  } finally {
    database.close();
  }
}

async function writeStore<T>(
  storeName: string,
  key: string,
  value: T,
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite", {
      durability: "strict",
    });
    transaction.objectStore(storeName).put(value, key);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function readRoadmap(): Promise<RoadmapData | null> {
  const stored = await readStore<unknown>(ROADMAP_STORE, ROADMAP_KEY);
  if (!stored) return null;
  if (isRoadmapWorkspace(stored)) {
    const roadmaps = stored.roadmaps
      .map((item) => migrateRoadmapData(item))
      .filter((item): item is RoadmapData => Boolean(item));
    return (
      roadmaps.find(
        (item) => item.settings.roadmapId === stored.activeRoadmapId,
      ) ?? roadmaps[0] ?? null
    );
  }
  return migrateRoadmapData(stored);
}

export async function readWorkspace(): Promise<RoadmapWorkspace | null> {
  const stored = await readStore<unknown>(ROADMAP_STORE, ROADMAP_KEY);
  if (!stored) return null;
  if (isRoadmapWorkspace(stored)) {
    const roadmaps = stored.roadmaps
      .map((item) => migrateRoadmapData(item))
      .filter((item): item is RoadmapData => Boolean(item));
    const activeRoadmapId = roadmaps.some(
      (item) => item.settings.roadmapId === stored.activeRoadmapId,
    )
      ? stored.activeRoadmapId
      : roadmaps[0].settings.roadmapId;
    return { ...stored, roadmaps, activeRoadmapId };
  }
  const migrated = migrateRoadmapData(stored);
  return migrated ? createWorkspace(migrated) : null;
}

export async function writeWorkspace(
  workspace: RoadmapWorkspace,
): Promise<void> {
  if (
    !workspace.roadmaps.length ||
    workspace.roadmaps.length > 100 ||
    !workspace.roadmaps.every(isRoadmapData) ||
    !workspace.roadmaps.some(
      (item) => item.settings.roadmapId === workspace.activeRoadmapId,
    )
  )
    throw new Error("保存データの形式が正しくありません");
  const next = structuredClone(workspace);
  next.updatedAt = new Date().toISOString();
  await writeStore(ROADMAP_STORE, ROADMAP_KEY, next);
}

export async function writeRoadmap(data: RoadmapData): Promise<void> {
  if (!isRoadmapData(data))
    throw new Error("保存データの形式が正しくありません");
  const next = structuredClone(data);
  next.settings.updatedAt = new Date().toISOString();
  const existing = await readWorkspace();
  const workspace = existing ?? createWorkspace(next);
  const found = workspace.roadmaps.some(
    (item) => item.settings.roadmapId === next.settings.roadmapId,
  );
  workspace.roadmaps = found
    ? workspace.roadmaps.map((item) =>
        item.settings.roadmapId === next.settings.roadmapId ? next : item,
      )
    : [...workspace.roadmaps, next];
  workspace.activeRoadmapId = next.settings.roadmapId;
  await writeWorkspace(workspace);
}

export async function readOnboardingDraft(): Promise<OnboardingDraft | null> {
  const value = await readStore<unknown>(DRAFT_STORE, ONBOARDING_DRAFT_KEY);
  if (!value || typeof value !== "object" || !("step" in value)) return null;
  return value as OnboardingDraft;
}

export async function writeOnboardingDraft(
  draft: OnboardingDraft,
): Promise<void> {
  await writeStore(DRAFT_STORE, ONBOARDING_DRAFT_KEY, structuredClone(draft));
}

export async function clearOnboardingDraft(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRAFT_STORE, "readwrite", {
      durability: "strict",
    });
    transaction.objectStore(DRAFT_STORE).delete(ONBOARDING_DRAFT_KEY);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function loadInitialData(): Promise<InitialLoadResult> {
  const existingWorkspace = await readWorkspace();
  const existing = existingWorkspace
    ? existingWorkspace.roadmaps.find(
        (item) => item.settings.roadmapId === existingWorkspace.activeRoadmapId,
      ) ?? existingWorkspace.roadmaps[0]
    : null;
  if (existing && existingWorkspace) {
    await writeWorkspace(existingWorkspace);
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    return {
      data: existing,
      workspace: existingWorkspace,
      source: "indexeddb",
      draft: null,
    };
  }

  const draft = await readOnboardingDraft();
  const legacyRaw =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(LEGACY_STORAGE_KEY)
      : null;
  if (!legacyRaw) {
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    return { data: null, workspace: null, source: "empty", draft };
  }

  try {
    const migrated = migrateRoadmapData(JSON.parse(legacyRaw));
    if (!migrated) {
      return {
        data: null,
        workspace: null,
        source: "empty",
        draft,
        migrationWarning:
          "以前のデータ形式を確認できませんでした。旧データは削除せず残しています。",
      };
    }
    const migratedWorkspace = createWorkspace(migrated);
    await writeWorkspace(migratedWorkspace);
    const verifiedWorkspace = await readWorkspace();
    const verified = verifiedWorkspace?.roadmaps[0] ?? null;
    if (!verified) throw new Error("移行後の確認に失敗しました");
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    return {
      data: verified,
      workspace: verifiedWorkspace,
      source: "migrated",
      draft: null,
    };
  } catch {
    return {
      data: null,
      workspace: null,
      source: "empty",
      draft,
      migrationWarning:
        "以前のデータを端末保存へ移行できませんでした。旧データは削除せず残しています。",
    };
  }
}

export async function deleteAppData(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      [ROADMAP_STORE, DRAFT_STORE],
      "readwrite",
      { durability: "strict" },
    );
    transaction.objectStore(ROADMAP_STORE).clear();
    transaction.objectStore(DRAFT_STORE).clear();
    await transactionDone(transaction);
  } finally {
    database.close();
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
}

export function createBackup(data: RoadmapData): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    data: {
      goals: structuredClone(data.goals),
      categories: structuredClone(data.categories),
      months: structuredClone(data.months),
      tasks: structuredClone(data.tasks),
      memories: structuredClone(data.memories),
      settings: structuredClone(data.settings),
    },
  };
}

export function downloadBackup(data: RoadmapData): void {
  const backup = createBackup(data);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `before-university-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function assertAllowedKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEYS.has(key))
      throw new Error("安全でないキーが含まれています");
    if (!allowed.includes(key))
      throw new Error(`${label}に対応していない項目があります`);
  }
}

function inspectTree(value: unknown, depth = 0, nodes = { count: 0 }): void {
  if (depth > 8) throw new Error("データの入れ子が深すぎます");
  nodes.count += 1;
  if (nodes.count > 30_000) throw new Error("データ量が多すぎます");
  if (typeof value === "string" && value.length > 20_000)
    throw new Error("長すぎる文字列が含まれています");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key))
      throw new Error("安全でないキーが含まれています");
    inspectTree(child, depth + 1, nodes);
  }
}

function isValidDate(value: unknown, optional = false): value is string | null {
  if (optional && (value === null || value === undefined || value === ""))
    return true;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?$/.test(value)
  )
    return false;
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return false;
  if (value.length === 10) {
    const [year, month, day] = value.split("-").map(Number);
    return (
      parsed.getFullYear() === year &&
      parsed.getMonth() + 1 === month &&
      parsed.getDate() === day
    );
  }
  return true;
}

function assertString(
  value: unknown,
  label: string,
  max: number,
  allowEmpty = true,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!allowEmpty && !value.trim())
  )
    throw new Error(`${label}の形式が正しくありません`);
}

function validateTask(value: unknown): asserts value is Task {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("タスクの形式が正しくありません");
  const task = value as Record<string, unknown>;
  assertAllowedKeys(
    task,
    [
      "id",
      "title",
      "description",
      "month",
      "category",
      "priority",
      "completed",
      "completedAt",
      "createdAt",
      "dueDate",
      "goalId",
      "progress",
      "status",
      "nextAction",
      "subtasks",
      "notes",
      "estimatedMinutes",
      "updatedAt",
      "archivedAt",
      "deletedAt",
    ],
    "タスク",
  );
  assertString(task.id, "タスクID", 200, false);
  assertString(task.title, "タスク名", 300, false);
  assertString(task.description, "タスクの説明", 5000);
  assertString(task.month, "対象月", 20, false);
  if (typeof task.category !== "string" || !(task.category in CATEGORY_META))
    throw new Error("タスクのカテゴリが正しくありません");
  if (!["high", "medium", "low"].includes(String(task.priority)))
    throw new Error("タスクの優先度が正しくありません");
  if (typeof task.completed !== "boolean")
    throw new Error("タスクの完了状態が正しくありません");
  if (
    !isValidDate(task.createdAt) ||
    !isValidDate(task.completedAt, true) ||
    !isValidDate(task.dueDate, true) ||
    !isValidDate(task.updatedAt, true) ||
    !isValidDate(task.archivedAt, true) ||
    !isValidDate(task.deletedAt, true)
  )
    throw new Error("タスクの日付が正しくありません");
  if (
    task.goalId !== null &&
    task.goalId !== undefined &&
    typeof task.goalId !== "string"
  )
    throw new Error("関連目標の形式が正しくありません");
  if (
    task.progress !== undefined &&
    (typeof task.progress !== "number" ||
      task.progress < 0 ||
      task.progress > 100)
  )
    throw new Error("タスクの進捗が正しくありません");
  if (
    task.status !== undefined &&
    !["not_started", "in_progress", "completed"].includes(String(task.status))
  )
    throw new Error("タスクの状態が正しくありません");
  if (task.nextAction !== undefined)
    assertString(task.nextAction, "次の一歩", 1000);
  if (task.notes !== undefined)
    assertString(task.notes, "タスクのメモ", 10_000);
  if (
    task.estimatedMinutes !== undefined &&
    (typeof task.estimatedMinutes !== "number" ||
      task.estimatedMinutes < 0 ||
      task.estimatedMinutes > 100_000)
  )
    throw new Error("想定時間が正しくありません");
  if (task.subtasks !== undefined) {
    if (!Array.isArray(task.subtasks) || task.subtasks.length > 100)
      throw new Error("サブタスクが多すぎます");
    for (const subtask of task.subtasks) {
      if (!subtask || typeof subtask !== "object" || Array.isArray(subtask))
        throw new Error("サブタスクの形式が正しくありません");
      const item = subtask as Record<string, unknown>;
      assertAllowedKeys(item, ["id", "title", "completed"], "サブタスク");
      assertString(item.id, "サブタスクID", 200, false);
      assertString(item.title, "サブタスク名", 300, false);
      if (typeof item.completed !== "boolean")
        throw new Error("サブタスクの完了状態が正しくありません");
    }
  }
}

function validateGoal(value: unknown): asserts value is Goal {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("目標の形式が正しくありません");
  const goal = value as Record<string, unknown>;
  assertAllowedKeys(
    goal,
    [
      "id",
      "title",
      "titleJa",
      "description",
      "category",
      "progress",
      "createdAt",
      "completedAt",
      "notes",
      "targetMonth",
    ],
    "目標",
  );
  assertString(goal.id, "目標ID", 200, false);
  assertString(goal.title, "目標名", 300, false);
  assertString(goal.titleJa, "目標名", 300);
  assertString(goal.description, "目標の説明", 5000);
  assertString(goal.notes, "目標のメモ", 10_000);
  if (typeof goal.category !== "string" || !(goal.category in CATEGORY_META))
    throw new Error("目標のカテゴリが正しくありません");
  if (
    typeof goal.progress !== "number" ||
    goal.progress < 0 ||
    goal.progress > 100
  )
    throw new Error("目標の進捗が正しくありません");
  if (!isValidDate(goal.createdAt) || !isValidDate(goal.completedAt, true))
    throw new Error("目標の日付が正しくありません");
  if (
    goal.targetMonth !== null &&
    goal.targetMonth !== undefined &&
    (typeof goal.targetMonth !== "string" ||
      !/^\d{4}-\d{2}$/.test(goal.targetMonth))
  )
    throw new Error("目標時期が正しくありません");
}

function validateMonth(value: unknown): asserts value is RoadmapMonth {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("月の形式が正しくありません");
  const month = value as Record<string, unknown>;
  assertAllowedKeys(
    month,
    [
      "id",
      "year",
      "month",
      "label",
      "short",
      "theme",
      "mainFocus",
      "notes",
      "review",
    ],
    "月",
  );
  assertString(month.id, "月ID", 20, false);
  if (
    typeof month.year !== "number" ||
    typeof month.month !== "number" ||
    month.month < 1 ||
    month.month > 12
  )
    throw new Error("月の日付が正しくありません");
  assertString(month.label, "月名", 50, false);
  assertString(month.short, "月略称", 12, false);
  assertString(month.theme, "月のテーマ", 300);
  assertString(month.mainFocus, "月のフォーカス", 1000);
  assertString(month.notes, "月のメモ", 10_000);
  if (
    !month.review ||
    typeof month.review !== "object" ||
    Array.isArray(month.review)
  )
    throw new Error("月の振り返りが正しくありません");
  const review = month.review as Record<string, unknown>;
  assertAllowedKeys(
    review,
    ["accomplished", "memorable", "next", "notes"],
    "月の振り返り",
  );
  for (const key of ["accomplished", "memorable", "next", "notes"])
    assertString(review[key], "月の振り返り", 10_000);
}

function validateMemory(value: unknown): asserts value is Memory {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("思い出の形式が正しくありません");
  const memory = value as Record<string, unknown>;
  assertAllowedKeys(
    memory,
    [
      "id",
      "title",
      "description",
      "date",
      "relatedGoal",
      "relatedTask",
      "imageUrl",
    ],
    "思い出",
  );
  assertString(memory.id, "思い出ID", 200, false);
  assertString(memory.title, "思い出のタイトル", 300, false);
  assertString(memory.description, "思い出の説明", 10_000);
  if (!isValidDate(memory.date))
    throw new Error("思い出の日付が正しくありません");
  if (
    memory.relatedGoal !== null &&
    memory.relatedGoal !== undefined &&
    typeof memory.relatedGoal !== "string"
  )
    throw new Error("関連目標が正しくありません");
  if (
    memory.relatedTask !== null &&
    memory.relatedTask !== undefined &&
    typeof memory.relatedTask !== "string"
  )
    throw new Error("関連タスクが正しくありません");
  if (
    memory.imageUrl !== null &&
    memory.imageUrl !== undefined &&
    memory.imageUrl !== ""
  )
    throw new Error("外部画像への参照は読み込めません");
}

function validateSettings(value: unknown): asserts value is RoadmapSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("設定の形式が正しくありません");
  const settings = value as Record<string, unknown>;
  assertAllowedKeys(
    settings,
    [
      "theme",
      "roadmapId",
      "roadmapName",
      "eventName",
      "eventDescription",
      "startDate",
      "finalGoal",
      "targetDate",
      "weeklyCapacityMinutes",
      "themeColor",
      "onboardingCompleted",
      "guideCompleted",
      "createdAt",
      "updatedAt",
    ],
    "設定",
  );
  if (!["light", "dark", "system"].includes(String(settings.theme)))
    throw new Error("テーマ設定が正しくありません");
  assertString(settings.roadmapId, "ロードマップID", 200, false);
  assertString(settings.roadmapName, "ロードマップ名", 200, false);
  assertString(settings.eventName, "イベント名", 200, false);
  assertString(settings.eventDescription, "イベントの説明", 2000);
  assertString(settings.finalGoal, "最終目標", 500, false);
  if (
    !isValidDate(settings.startDate) ||
    !isValidDate(settings.targetDate) ||
    !isValidDate(settings.createdAt) ||
    !isValidDate(settings.updatedAt)
  )
    throw new Error("設定の日付が正しくありません");
  if (String(settings.targetDate) <= String(settings.startDate))
    throw new Error("イベント日は開始日より後にしてください");
  if (
    settings.weeklyCapacityMinutes !== null &&
    (typeof settings.weeklyCapacityMinutes !== "number" ||
      settings.weeklyCapacityMinutes < 0 ||
      settings.weeklyCapacityMinutes > 10_080)
  )
    throw new Error("1週間に使える時間が正しくありません");
  assertString(settings.themeColor, "テーマカラー", 32, false);
  if (
    typeof settings.onboardingCompleted !== "boolean" ||
    typeof settings.guideCompleted !== "boolean"
  )
    throw new Error("案内設定が正しくありません");
}

export function parseBackupText(text: string): BackupEnvelope {
  if (new Blob([text]).size > MAX_BACKUP_BYTES)
    throw new Error("ファイルサイズは2MB以下にしてください");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSONファイルを読み取れませんでした");
  }
  inspectTree(parsed);
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "version" in parsed &&
    !("format" in parsed)
  ) {
    const migrated = migrateRoadmapData(parsed);
    if (!migrated)
      throw new Error("以前のバックアップ形式を確認できませんでした");
    parsed = createBackup(migrated);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("バックアップの形式が正しくありません");
  const envelope = parsed as Record<string, unknown>;
  assertAllowedKeys(
    envelope,
    ["format", "schemaVersion", "exportedAt", "appVersion", "data"],
    "バックアップ",
  );
  if (envelope.format !== BACKUP_FORMAT)
    throw new Error("Before Universityのバックアップではありません");
  if (envelope.schemaVersion !== BACKUP_SCHEMA_VERSION)
    throw new Error("このバージョンでは読み込めないバックアップです");
  if (!isValidDate(envelope.exportedAt))
    throw new Error("書き出し日時が正しくありません");
  assertString(envelope.appVersion, "アプリバージョン", 50, false);
  if (
    !envelope.data ||
    typeof envelope.data !== "object" ||
    Array.isArray(envelope.data)
  )
    throw new Error("バックアップデータがありません");
  const data = envelope.data as Record<string, unknown>;
  assertAllowedKeys(
    data,
    ["goals", "categories", "months", "tasks", "memories", "settings"],
    "データ",
  );
  if (!Array.isArray(data.goals) || data.goals.length > 1000)
    throw new Error("目標の件数が多すぎます");
  if (!Array.isArray(data.tasks) || data.tasks.length > 5000)
    throw new Error("タスクの件数が多すぎます");
  if (
    !Array.isArray(data.months) ||
    data.months.length > 120 ||
    data.months.length === 0
  )
    throw new Error("月の件数が正しくありません");
  if (!Array.isArray(data.memories) || data.memories.length > 2000)
    throw new Error("思い出の件数が多すぎます");
  if (!Array.isArray(data.categories) || data.categories.length > 50)
    throw new Error("カテゴリの件数が正しくありません");
  data.goals.forEach(validateGoal);
  data.tasks.forEach(validateTask);
  data.months.forEach(validateMonth);
  data.memories.forEach(validateMemory);
  for (const category of data.categories) {
    if (!category || typeof category !== "object" || Array.isArray(category))
      throw new Error("カテゴリの形式が正しくありません");
    const item = category as Record<string, unknown>;
    assertAllowedKeys(item, ["id", "label"], "カテゴリ");
    if (typeof item.id !== "string" || !(item.id in CATEGORY_META))
      throw new Error("カテゴリIDが正しくありません");
    assertString(item.label, "カテゴリ名", 100, false);
  }
  validateSettings(data.settings);
  const normalized: RoadmapData = {
    version: 2,
    goals: data.goals as Goal[],
    categories: data.categories as RoadmapData["categories"],
    months: data.months as RoadmapMonth[],
    tasks: data.tasks as Task[],
    memories: data.memories as Memory[],
    settings: data.settings as RoadmapSettings,
  };
  if (!isRoadmapData(normalized))
    throw new Error("バックアップのデータ構造が正しくありません");
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: envelope.exportedAt as string,
    appVersion: envelope.appVersion as string,
    data: normalized,
  };
}

function remapId(id: string, used: Set<string>, prefix: string) {
  if (!used.has(id)) {
    used.add(id);
    return id;
  }
  const randomId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let next = `${prefix}-${randomId()}`;
  while (used.has(next)) next = `${prefix}-${randomId()}`;
  used.add(next);
  return next;
}

export function mergeRoadmaps(
  current: RoadmapData,
  incoming: RoadmapData,
): RoadmapData {
  const goalIds = new Set(current.goals.map((item) => item.id));
  const taskIds = new Set(current.tasks.map((item) => item.id));
  const memoryIds = new Set(current.memories.map((item) => item.id));
  const goalMap = new Map<string, string>();
  const taskMap = new Map<string, string>();
  const goals = incoming.goals.map((goal) => {
    const id = remapId(goal.id, goalIds, "goal");
    goalMap.set(goal.id, id);
    return { ...goal, id };
  });
  const tasks = incoming.tasks.map((task) => {
    const id = remapId(task.id, taskIds, "task");
    taskMap.set(task.id, id);
    return {
      ...task,
      id,
      goalId: task.goalId ? (goalMap.get(task.goalId) ?? task.goalId) : null,
    };
  });
  const memories = incoming.memories.map((memory) => ({
    ...memory,
    id: remapId(memory.id, memoryIds, "memory"),
    relatedGoal: memory.relatedGoal
      ? (goalMap.get(memory.relatedGoal) ?? memory.relatedGoal)
      : null,
    relatedTask: memory.relatedTask
      ? (taskMap.get(memory.relatedTask) ?? memory.relatedTask)
      : null,
  }));
  const monthIds = new Set(current.months.map((item) => item.id));
  const categoryIds = new Set(current.categories.map((item) => item.id));
  return {
    ...current,
    goals: [...current.goals, ...goals],
    tasks: [...current.tasks, ...tasks],
    memories: [...current.memories, ...memories],
    months: [
      ...current.months,
      ...incoming.months.filter((item) => !monthIds.has(item.id)),
    ].sort((a, b) => a.id.localeCompare(b.id)),
    categories: [
      ...current.categories,
      ...incoming.categories.filter((item) => !categoryIds.has(item.id)),
    ],
    settings: { ...current.settings, updatedAt: new Date().toISOString() },
  };
}

export async function importRoadmap(
  current: RoadmapData | null,
  backup: BackupEnvelope,
  mode: ImportMode,
): Promise<RoadmapData> {
  const incoming: RoadmapData = { version: 2, ...structuredClone(backup.data) };
  const next =
    mode === "merge" && current ? mergeRoadmaps(current, incoming) : incoming;
  await writeRoadmap(next);
  const verified = await readRoadmap();
  if (!verified) throw new Error("読み込み後の確認に失敗しました");
  return verified;
}
