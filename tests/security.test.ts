import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  MAX_BACKUP_BYTES,
  createBackup,
  hasMatchingRecordIdentity,
  mergeRoadmaps,
  parseBackupText,
} from "../app/local-data";
import { buildNextStepPrompt, copyTextWithFallback } from "../app/next-step-prompt";
import {
  buildRoadmapAIPrompt,
  createEventBackup,
  parseEventBackupText,
} from "../app/event-backup";
import {
  createEmptyData,
  createSampleData,
  migrateRoadmapData,
  type Task,
} from "../app/roadmap-data";

let passed = 0;
const test = async (name: string, run: () => void | Promise<void>) => {
  await run();
  passed += 1;
  process.stdout.write(`✓ ${name}\n`);
};
const asText = (value: unknown) => JSON.stringify(value);
const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx|js|jsx)$/.test(name)
        ? [path]
        : [];
  });
const validData = createSampleData({
  targetDate: "2027-04-01",
  onboardingCompleted: true,
  guideCompleted: true,
});

await test("a new browser starts with no personal roadmap records", () => {
  const empty = createEmptyData();
  assert.equal(empty.goals.length, 0);
  assert.equal(empty.tasks.length, 0);
  assert.equal(empty.memories.length, 0);
  assert.equal(empty.settings.onboardingCompleted, false);
  assert.doesNotMatch(asText(empty), /sample-(goal|task|memory)/);
});

await test("legacy version 1 records migrate without duplication or reset", () => {
  const original = createSampleData();
  const legacy = {
    version: 1,
    tasks: structuredClone(original.tasks),
    goals: structuredClone(original.goals),
    months: structuredClone(original.months),
    memories: structuredClone(original.memories),
    settings: { theme: "dark" as const },
  };
  const migrated = migrateRoadmapData(legacy);
  assert.ok(migrated);
  assert.equal(migrated.tasks.length, original.tasks.length);
  assert.equal(migrated.goals.length, original.goals.length);
  assert.equal(migrated.tasks[0].id, original.tasks[0].id);
  assert.equal(migrated.settings.theme, "dark");
  assert.equal(migrated.settings.onboardingCompleted, true);
  assert.equal(migrated.settings.guideCompleted, true);
});

await test("migration verification detects missing or replaced record IDs", () => {
  const source = createSampleData();
  assert.equal(hasMatchingRecordIdentity(source, structuredClone(source)), true);

  const missingTask = structuredClone(source);
  missingTask.tasks.pop();
  assert.equal(hasMatchingRecordIdentity(source, missingTask), false);

  const replacedTask = structuredClone(source);
  replacedTask.tasks[0].id = "different-task-id";
  assert.equal(hasMatchingRecordIdentity(source, replacedTask), false);
});

await test("event schema v2 round-trips and regenerates safe internal IDs", () => {
  const source = createSampleData({
    roadmapName: "文化祭まで",
    eventName: "文化祭",
    eventDescription: "小さな展示を完成させる",
    startDate: "2026-09-09",
    targetDate: "2026-11-01",
    weeklyCapacityMinutes: 180,
  });
  const parsed = parseEventBackupText(asText(createEventBackup(source)));
  assert.equal(parsed.data.settings.eventName, "文化祭");
  assert.equal(parsed.data.settings.targetDate, "2026-11-01");
  assert.equal(parsed.data.settings.weeklyCapacityMinutes, 180);
  assert.notEqual(parsed.data.settings.roadmapId, source.settings.roadmapId);
  assert.notEqual(parsed.data.tasks[0].id, source.tasks[0].id);
  assert.ok(parsed.data.goals.some((goal) => goal.id === parsed.data.tasks[0].goalId));
});

await test("event backup preserves completion state and remaps memory references", () => {
  const source = createSampleData({
    roadmapName: "作品公開まで",
    eventName: "作品公開",
    startDate: "2026-09-09",
    targetDate: "2026-12-01",
  });
  source.goals[0].progress = 100;
  source.goals[0].completedAt = "2026-09-10";
  source.tasks[0] = {
    ...source.tasks[0],
    completed: true,
    status: "completed",
    progress: 100,
    completedAt: "2026-09-10",
    updatedAt: "2026-09-10T12:00:00.000Z",
  };
  source.memories = [{
    id: "memory-1",
    title: "最初の記録",
    description: "小さな成果を残した。",
    date: "2026-09-10",
    relatedGoal: source.goals[0].id,
    relatedTask: source.tasks[0].id,
    imageUrl: null,
  }];
  const parsed = parseEventBackupText(asText(createEventBackup(source))).data;
  assert.equal(parsed.goals[0].progress, 100);
  assert.equal(parsed.goals[0].completedAt, "2026-09-10");
  assert.equal(parsed.tasks[0].completed, true);
  assert.equal(parsed.tasks[0].completedAt, "2026-09-10");
  assert.equal(parsed.memories[0].relatedGoal, parsed.goals[0].id);
  assert.equal(parsed.memories[0].relatedTask, parsed.tasks[0].id);
});

await test("conflicting task completion fields are rejected", () => {
  const backup = createEventBackup(validData);
  backup.roadmap.tasks[0].completed = true;
  backup.roadmap.tasks[0].status = "not_started";
  assert.throws(() => parseEventBackupText(asText(backup)), /一致/);
});

await test("markdown fenced JSON is accepted but surrounding text is rejected", () => {
  const json = asText(createEventBackup(validData));
  assert.equal(parseEventBackupText(`\`\`\`json\n${json}\n\`\`\``).data.tasks.length, validData.tasks.length);
  assert.throws(() => parseEventBackupText(`説明です\n${json}`), /JSON/);
});

await test("event dates must follow start dates", () => {
  const backup = createEventBackup(validData);
  backup.roadmap.event.date = backup.roadmap.startDate;
  assert.throws(() => parseEventBackupText(asText(backup)), /開始日より後/);
});

await test("tasks after the event are previewed as warnings", () => {
  const backup = createEventBackup(validData);
  backup.roadmap.event.date = "2026-09-20";
  backup.roadmap.tasks[0].dueDate = "2026-09-21";
  const parsed = parseEventBackupText(asText(backup));
  assert.equal(parsed.warnings.length, 1);
});

await test("AI planning prompt embeds the current import schema locally", () => {
  const prompt = buildRoadmapAIPrompt();
  assert.match(prompt, /before-roadmap/);
  assert.match(prompt, /schemaVersion/);
  assert.match(prompt, /最初の質問を1つだけ/);
  assert.match(prompt, /健康や運動/);
  assert.match(prompt, /未着手タスクの進捗が0/);
  assert.doesNotMatch(prompt, /https:\/\/chatgpt\.com/);
});

await test("import UI includes local AI workflow and event countdown preview", () => {
  const source = readFileSync("app/backup-ui.tsx", "utf8");
  assert.match(source, /専用プロンプトをコピー/);
  assert.match(source, /作成したファイルを読み込む/);
  assert.match(source, /remainingLabel/);
});

await test("roadmap editor exposes theme, backup, and date-impact warning", () => {
  const manager = readFileSync("app/roadmap-manager.tsx", "utf8");
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(manager, /選択中をバックアップ/);
  assert.match(manager, /変更後のイベント日より後に、期限が設定されたタスク/);
  assert.match(manager, /aria-pressed/);
  assert.match(page, /data-roadmap-theme/);
});

await test("client source has no personal-data network transports or HTML injection", () => {
  const source = [...sourceFiles("app"), ...sourceFiles("components")]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  for (const forbidden of [
    /\bfetch\s*\(/,
    /\baxios\b/,
    /XMLHttpRequest/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /sendBeacon/,
    /dangerouslySetInnerHTML/,
    /\.innerHTML\s*=/,
    /localStorage\.clear\s*\(/,
  ]) assert.doesNotMatch(source, forbidden);
});

await test("shared dialog is a viewport-safe mobile bottom sheet", () => {
  const source = readFileSync("components/ui/dialog.tsx", "utf8");
  assert.match(source, /fixed inset-x-0 bottom-0/);
  assert.match(source, /box-border max-h-\[100dvh\] w-full max-w-full/);
  assert.match(source, /overflow-x-hidden overflow-y-auto/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /sm:left-\[50%\][\s\S]*sm:translate-x-\[-50%\]/);
});

await test("valid backup round-trips", () => {
  const parsed = parseBackupText(asText(createBackup(validData)));
  assert.equal(parsed.data.tasks.length, validData.tasks.length);
});

await test("XSS strings remain inert text", () => {
  const backup = createBackup(validData);
  backup.data.tasks[0].title = "<script>alert(1)</script>";
  const parsed = parseBackupText(asText(backup));
  assert.equal(parsed.data.tasks[0].title, "<script>alert(1)</script>");
});

await test("malformed JSON is rejected", () => {
  assert.throws(() => parseBackupText("{"), /JSON/);
});

await test("wrong format is rejected", () => {
  const backup = createBackup(validData) as Record<string, unknown>;
  backup.format = "another-app";
  assert.throws(() => parseBackupText(asText(backup)), /Before University/);
});

await test("unsupported schema is rejected", () => {
  const backup = createBackup(validData) as Record<string, unknown>;
  backup.schemaVersion = 999;
  assert.throws(() => parseBackupText(asText(backup)), /読み込めない/);
});

await test("oversized files are rejected", () => {
  assert.throws(() => parseBackupText("x".repeat(MAX_BACKUP_BYTES + 1)), /2MB/);
});

await test("prototype-pollution keys are rejected", () => {
  const text = asText(createBackup(validData)).replace(
    '"format":',
    '"__proto__":{"polluted":true},"format":',
  );
  assert.throws(() => parseBackupText(text), /安全でないキー/);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

await test("excessive nesting is rejected", () => {
  const backup = createBackup(validData) as unknown as Record<string, unknown>;
  let nested: Record<string, unknown> = {};
  const root = nested;
  for (let index = 0; index < 12; index += 1) {
    nested.next = {};
    nested = nested.next as Record<string, unknown>;
  }
  backup.extra = root;
  assert.throws(() => parseBackupText(asText(backup)), /入れ子/);
});

await test("invalid calendar dates are rejected", () => {
  const backup = createBackup(validData);
  backup.data.tasks[0].dueDate = "2026-02-31";
  assert.throws(() => parseBackupText(asText(backup)), /日付/);
});

await test("external image references are rejected", () => {
  const backup = createBackup(validData);
  backup.data.memories.push({
    id: "memory-url",
    title: "記録",
    description: "text",
    date: "2026-09-09",
    relatedGoal: null,
    relatedTask: null,
    imageUrl: "javascript:alert(1)",
  });
  assert.throws(() => parseBackupText(asText(backup)), /外部画像/);
});

await test("array count limits are enforced atomically", () => {
  const backup = createBackup(validData);
  backup.data.goals = Array.from({ length: 1001 }, (_, index) => ({
    ...backup.data.goals[0],
    id: `goal-${index}`,
  }));
  assert.throws(() => parseBackupText(asText(backup)), /件数/);
});

await test("merge remaps conflicting references", () => {
  const current = createSampleData();
  const incoming = structuredClone(current);
  const merged = mergeRoadmaps(current, incoming);
  assert.equal(merged.goals.length, current.goals.length * 2);
  assert.equal(merged.tasks.length, current.tasks.length * 2);
  assert.notEqual(merged.goals.at(-1)?.id, current.goals.at(-1)?.id);
  assert.ok(merged.goals.some((goal) => goal.id === merged.tasks.at(-1)?.goalId));
});

const allInfoTask: Task = {
  id: "task-full",
  title: "画面を実装する 🚀 <check>",
  description: "既存デザインを保ったまま、小さな画面を作る。",
  month: "2026-09",
  category: "programming",
  priority: "high",
  completed: false,
  completedAt: null,
  createdAt: "2026-09-01",
  dueDate: "2026-09-06",
  goalId: null,
  progress: 50,
  status: "in_progress",
  notes: "メモ",
  estimatedMinutes: 25,
  updatedAt: "2026-09-09T10:00:00.000Z",
  subtasks: [
    { id: "sub-1", title: "構造を作る", completed: true },
    { id: "sub-2", title: "表示を確認する", completed: false },
  ],
};
const context = {
  categoryName: "プログラミング",
  status: "進行中",
  progress: 50,
  finalGoal: "目標日までに作品を作る",
  targetDate: "2027-04-01",
};

await test("full task prompt includes dynamic local context", () => {
  const prompt = buildNextStepPrompt(allInfoTask, context, new Date("2026-09-09T12:00:00Z"));
  assert.match(prompt, /期限を3日超過/);
  assert.match(prompt, /構造を作る/);
  assert.match(prompt, /表示を確認する/);
  assert.match(prompt, /25分/);
  assert.match(prompt, /画面を実装する 🚀 <check>/);
});

await test("missing fields are naturally omitted", () => {
  const data = createEmptyData();
  const task: Task = {
    ...allInfoTask,
    title: "名前だけのタスク",
    description: "",
    dueDate: null,
    notes: undefined,
    subtasks: undefined,
    estimatedMinutes: undefined,
    updatedAt: null,
  };
  const prompt = buildNextStepPrompt(task, {
    categoryName: "生活",
    status: "未着手",
    progress: 0,
    finalGoal: data.settings.finalGoal,
    targetDate: data.settings.targetDate,
  });
  assert.doesNotMatch(prompt, /【メモ】/);
  assert.doesNotMatch(prompt, /【完了済みの内容】/);
  assert.doesNotMatch(prompt, /\n{3,}/);
});

await test("completed tasks request reflection instead of forced work", () => {
  const prompt = buildNextStepPrompt(
    { ...allInfoTask, completed: true, status: "completed", progress: 100 },
    { ...context, status: "完了", progress: 100 },
  );
  assert.match(prompt, /完了済み/);
  assert.match(prompt, /記録・振り返り/);
});

await test("clipboard API success path is used", async () => {
  let copied = "";
  const result = await copyTextWithFallback("prompt", {
    writeText: async (text) => { copied = text; },
    selectText: () => assert.fail("selection fallback should not run"),
    legacyCopy: () => false,
  });
  assert.equal(result, "clipboard");
  assert.equal(copied, "prompt");
});

await test("clipboard failure falls back to selection", async () => {
  let selected = false;
  const result = await copyTextWithFallback("prompt", {
    writeText: async () => { throw new Error("denied"); },
    selectText: () => { selected = true; },
    legacyCopy: () => false,
  });
  assert.equal(result, "selected");
  assert.equal(selected, true);
});

process.stdout.write(`\n${passed} security and prompt tests passed.\n`);
