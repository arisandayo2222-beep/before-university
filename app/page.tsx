"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "./providers";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  Copy,
  Download,
  Dumbbell,
  Database,
  Ellipsis,
  Flag,
  Focus,
  HardDrive,
  Heart,
  Home,
  Laptop,
  Layers3,
  Map,
  Moon,
  NotebookPen,
  Palette,
  Plane,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Settings,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Trophy,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { BackupImportDialog } from "./backup-ui";
import { downloadEventBackup } from "./event-backup";
import { FirstUseGuide, Onboarding } from "./onboarding";
import { RoadmapSwitcher } from "./roadmap-manager";
import {
  clearOnboardingDraft,
  createWorkspace,
  deleteAppData,
  downloadBackup,
  loadInitialData,
  writeOnboardingDraft,
  writeRoadmap,
  writeWorkspace,
  type OnboardingDraft,
  type RoadmapWorkspace,
  type SaveStatus,
} from "./local-data";
import {
  CATEGORY_META,
  PRIORITY_LABEL,
  type Category,
  type Goal,
  type Memory,
  type Priority,
  type RoadmapData,
  type RoadmapMonth,
  type Task,
  type ThemeMode,
} from "./roadmap-data";
import { buildNextStepPrompt, copyTextWithFallback } from "./next-step-prompt";

type Page = "home" | "roadmap" | "goals" | "memories" | "settings";
type AskAIHandler = (task: Task, trigger?: HTMLButtonElement) => void;
const NAV_ITEMS: Array<{ id: Page; label: string; icon: typeof Home }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "roadmap", label: "Roadmap", icon: Map },
  { id: "goals", label: "Goals", icon: Target },
  { id: "memories", label: "Memories", icon: Sparkles },
  { id: "settings", label: "Settings", icon: Settings },
];
const MOBILE_NAV = NAV_ITEMS.map((item) =>
  item.id === "settings" ? { ...item, label: "More" } : item,
);
const clamp = (value: number) => Math.min(100, Math.max(0, value));
const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const formatShortDate = (date: string) =>
  new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" }).format(
    new Date(`${date}T00:00:00`),
  );
function getCurrentMonthId(now: Date, months: RoadmapMonth[] = []) {
  const raw = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const first = months[0]?.id ?? raw;
  const last = months[months.length - 1]?.id ?? raw;
  return raw < first ? first : raw > last ? last : raw;
}
function isActiveTask(task: Task) {
  return !task.archivedAt && !task.deletedAt;
}
function getTaskProgress(task: Task) {
  if (task.subtasks?.length)
    return Math.round(
      (task.subtasks.filter((item) => item.completed).length /
        task.subtasks.length) *
        100,
    );
  if (typeof task.progress === "number" && Number.isFinite(task.progress))
    return clamp(Math.round(task.progress));
  return task.completed ? 100 : 0;
}
function activeTasks(tasks: Task[]) {
  return tasks.filter(isActiveTask);
}
function taskCompletion(tasks: Task[]) {
  const included = activeTasks(tasks);
  return included.length
    ? Math.round(
        included.reduce((sum, task) => sum + getTaskProgress(task), 0) /
          included.length,
      )
    : 0;
}
function completedTaskCount(tasks: Task[]) {
  return activeTasks(tasks).filter((task) => getTaskProgress(task) === 100)
    .length;
}
function getTaskStatus(task: Task) {
  const progress = getTaskProgress(task);
  return progress >= 100
    ? "完了"
    : progress > 0 || task.status === "in_progress"
      ? "進行中"
      : "未着手";
}
function getGoalProgress(goal: Goal, tasks: Task[]) {
  if (goal.completedAt) return 100;
  const related = activeTasks(tasks).filter((task) => task.goalId === goal.id);
  return related.length ? taskCompletion(related) : clamp(goal.progress);
}

const CATEGORY_ICONS: Record<Category, typeof Home> = {
  programming: Code2,
  ai: Bot,
  creative: Palette,
  learning: BookOpen,
  law: Scale,
  travel: Plane,
  relationship: Heart,
  money: BriefcaseBusiness,
  health: Dumbbell,
  life: Circle,
};

function CategoryPill({
  category,
  compact = false,
}: {
  category: Category;
  compact?: boolean;
}) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[color:color-mix(in_srgb,var(--category)_22%,transparent)] bg-[var(--category-bg)] text-[var(--category)]",
        compact ? "gap-1 px-2 py-0.5 text-xs" : "gap-1.5 px-2.5 py-1 text-xs",
        meta.className,
      )}
    >
      <span aria-hidden="true">{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-xl font-semibold tracking-[-0.025em] sm:text-2xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function SegmentedCategoryBar({ tasks }: { tasks: Task[] }) {
  const counts = Object.keys(CATEGORY_META)
    .map((category) => ({
      category: category as Category,
      count: tasks.filter((task) => task.category === category).length,
    }))
    .filter((entry) => entry.count > 0);
  const total = Math.max(tasks.length, 1);
  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
      aria-label="カテゴリーの割合"
    >
      {counts.map(({ category, count }) => (
        <span
          key={category}
          className={cn(
            "h-full bg-[var(--category)]",
            CATEGORY_META[category].className,
          )}
          style={{ width: `${(count / total) * 100}%` }}
          title={`${CATEGORY_META[category].label}: ${count}`}
        />
      ))}
    </div>
  );
}

function AskAIButton({
  task,
  onAskAI,
  compact = false,
  className,
}: {
  task: Task;
  onAskAI: AskAIHandler;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      data-guide="ask-ai"
      variant="ghost"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onAskAI(task, event.currentTarget);
      }}
      aria-label={`${task.title}についてAIに次の一歩を聞く`}
      className={cn(
        "ios-press h-11 shrink-0 rounded-xl px-3 text-primary hover:bg-primary/10 hover:text-primary",
        compact ? "gap-1.5 px-2.5 text-xs" : "gap-2 text-sm",
        className,
      )}
    >
      <Sparkles className="size-4" aria-hidden="true" />
      <span>
        {compact ? (
          "AI"
        ) : (
          <>
            <span className="sm:hidden">AI</span>
            <span className="hidden sm:inline">AIで次の一歩</span>
          </>
        )}
      </span>
    </Button>
  );
}

function NextStepPromptSheet({
  task,
  data,
  open,
  onOpenChange,
  onMarkInProgress,
  returnFocusRef,
}: {
  task: Task | null;
  data: RoadmapData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkInProgress: (id: string) => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState(() =>
    task
      ? buildNextStepPrompt(
          task,
          {
            goal: task.goalId
              ? data.goals.find((item) => item.id === task.goalId)
              : null,
            month: data.months.find((item) => item.id === task.month),
            categoryName: CATEGORY_META[task.category].label,
            status: getTaskStatus(task),
            progress: getTaskProgress(task),
            finalGoal: data.settings.finalGoal,
            targetDate: data.settings.targetDate,
          },
          new Date(),
        )
      : "",
  );
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = await copyTextWithFallback(prompt, {
      writeText:
        typeof navigator !== "undefined" && navigator.clipboard?.writeText
          ? (text) => navigator.clipboard.writeText(text)
          : undefined,
      selectText: () => {
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
      },
      legacyCopy: () =>
        typeof document !== "undefined" &&
        typeof document.execCommand === "function"
          ? document.execCommand("copy")
          : false,
    });
    if (result === "selected") {
      toast.info("プロンプトを選択しました。端末のコピー操作を使ってください");
      return;
    }
    setCopied(true);
    toast.success("プロンプトをコピーしました。ChatGPTに貼り付けて使えます", {
      duration: 5000,
    });
  };

  if (!task) return null;
  const canStart = getTaskProgress(task) < 100 && task.status !== "in_progress";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-[680px]"
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        <DialogHeader>
          <div className="mb-2 grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>AIに次の一歩を聞く</DialogTitle>
          <DialogDescription>
            内容を確認・編集してから、使いたいAIへ貼り付けられます。プロンプトは端末内で作られ、自動送信しません。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-[var(--separator)] bg-[var(--surface-subtle)] px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            対象のタスク
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-6 break-words">
            {task.title}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="next-step-prompt">AIへ渡すプロンプト</Label>
          <Textarea
            ref={textareaRef}
            id="next-step-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-[300px] resize-y rounded-2xl bg-background font-sans text-[14px] leading-6 sm:min-h-[360px]"
            aria-describedby="next-step-prompt-help"
          />
          <p
            id="next-step-prompt-help"
            className="text-xs leading-5 text-muted-foreground"
          >
            不足している項目は自動で省略されています。コピーした内容を外部AIへ貼り付けると、そのサービスへ情報が送信されます。メモなどに個人情報が含まれていないか確認してください。
          </p>
        </div>
        {copied && canStart ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onMarkInProgress(task.id)}
            className="h-11 justify-start rounded-xl text-primary hover:bg-primary/10 hover:text-primary"
          >
            <Circle className="size-4" />
            このタスクを進行中にする
          </Button>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-11"
          >
            閉じる
          </Button>
          <Button
            type="button"
            onClick={copyPrompt}
            disabled={!prompt.trim()}
            className="h-11"
          >
            <Copy className="size-4" />
            コピーする
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
  onAskAI,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: (title: string) => void;
  onDelete: () => void;
  onAskAI?: AskAIHandler;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== task.title) onEdit(next);
    else setDraft(task.title);
    setEditing(false);
  };
  const progress = getTaskProgress(task);
  const completed = progress === 100;
  const status = getTaskStatus(task);
  return (
    <div className="ios-list-row group flex min-h-[68px] items-center gap-3 rounded-2xl px-2 py-2.5 sm:px-3">
      <Checkbox
        data-guide="task-status"
        checked={completed}
        onCheckedChange={onToggle}
        aria-label={`${task.title}を${completed ? "未完了" : "完了"}にする`}
        className="size-6 rounded-full border-2 data-[state=checked]:border-[var(--success)] data-[state=checked]:bg-[var(--success)]"
      />
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") {
                setDraft(task.title);
                setEditing(false);
              }
            }}
            autoFocus
            aria-label="タスク名を編集"
            className="h-10 rounded-xl"
          />
        ) : (
          <button
            className={cn(
              "block max-w-full truncate text-left text-[15px] font-medium leading-6 transition-colors",
              completed &&
                "text-muted-foreground line-through decoration-border",
            )}
            onDoubleClick={() => setEditing(true)}
            title="ダブルクリックで編集"
          >
            {task.title}
          </button>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <CategoryPill category={task.category} compact />
          {task.dueDate ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatShortDate(task.dueDate)}
            </span>
          ) : null}
          <span
            className={cn(
              "rounded-full px-2 py-0.5",
              completed
                ? "bg-[color:color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]"
                : progress > 0
                  ? "bg-primary/10 text-primary"
                  : "bg-muted",
            )}
          >
            {status}
            {progress > 0 && progress < 100 ? ` ${progress}%` : ""}
          </span>
          {task.priority === "high" && !completed ? (
            <span className="font-medium text-[var(--warning)]">優先</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        {onAskAI ? <AskAIButton task={task} onAskAI={onAskAI} /> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 opacity-70 sm:size-9 sm:opacity-0 sm:group-hover:opacity-100"
              aria-label={`${task.title}のメニュー`}
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              名前を編集
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 className="size-4" />
              削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function AppMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 overflow-hidden">
      <div className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Flag className="size-[18px]" />
        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar bg-[#55a178]" />
      </div>
      {!compact ? (
        <div className="tablet-brand-text min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.02em]">
            Before University
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Personal Roadmap
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AddTaskDialog({
  open,
  onOpenChange,
  data,
  defaultMonth,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: RoadmapData;
  defaultMonth: string;
  onAdd: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [month, setMonth] = useState(defaultMonth);
  const [category, setCategory] = useState<Category>("life");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [goalId, setGoalId] = useState("none");
  const handleOpenChange = (nextOpen: boolean) => {
    if (
      !nextOpen &&
      (title.trim() || dueDate || goalId !== "none") &&
      !window.confirm("未保存の入力があります。閉じますか？")
    )
      return;
    onOpenChange(nextOpen);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd({
      id: makeId("task"),
      title: title.trim(),
      description: "",
      month,
      category,
      priority,
      completed: false,
      completedAt: null,
      createdAt: toDateKey(new Date()),
      dueDate: dueDate || null,
      goalId: goalId === "none" ? null : goalId,
      progress: 0,
      status: "not_started",
      nextAction: "",
    });
    setTitle("");
    setDueDate("");
    setGoalId("none");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>タスクを追加</DialogTitle>
          <DialogDescription>
            次に進めたいことを、一つだけ具体的に置きます。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="task-title">タスク名</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例：アプリの画面構成を決める"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>月</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.months.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.year}年{item.month}月
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>カテゴリー</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as Category)}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {meta.icon} {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>優先度</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as Priority)}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABEL).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-date">日付（任意）</Label>
              <Input
                id="task-date"
                type="date"
                max={data.settings.targetDate}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>関連Goal（任意）</Label>
            <Select value={goalId} onValueChange={setGoalId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">関連付けない</SelectItem>
                {data.goals.map((goal) => (
                  <SelectItem key={goal.id} value={goal.id}>
                    {goal.title} — {goal.titleJa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              追加する
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddGoalDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (goal: Goal) => void;
}) {
  const [title, setTitle] = useState("");
  const [titleJa, setTitleJa] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("learning");
  const handleOpenChange = (nextOpen: boolean) => {
    if (
      !nextOpen &&
      (title.trim() || titleJa.trim() || description.trim()) &&
      !window.confirm("未保存の入力があります。閉じますか？")
    )
      return;
    onOpenChange(nextOpen);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !titleJa.trim()) return;
    onAdd({
      id: makeId("goal"),
      title: title.trim(),
      titleJa: titleJa.trim(),
      description: description.trim(),
      category,
      progress: 0,
      createdAt: toDateKey(new Date()),
      completedAt: null,
      notes: "",
    });
    setTitle("");
    setTitleJa("");
    setDescription("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Goalを追加</DialogTitle>
          <DialogDescription>
            複数のタスクを束ねる、大きな到達点を作ります。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal-en">Goal name</Label>
            <Input
              id="goal-en"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例：Build a Portfolio"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-ja">日本語名</Label>
            <Input
              id="goal-ja"
              value={titleJa}
              onChange={(event) => setTitleJa(event.target.value)}
              placeholder="例：ポートフォリオを作る"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-description">説明</Label>
            <Textarea
              id="goal-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="このGoalで何を実現したいか"
            />
          </div>
          <div className="space-y-2">
            <Label>カテゴリー</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as Category)}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.icon} {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={!title.trim() || !titleJa.trim()}>
              作成する
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddMemoryDialog({
  open,
  onOpenChange,
  data,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: RoadmapData;
  onAdd: (memory: Memory) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(toDateKey(new Date()));
  const [goal, setGoal] = useState("none");
  const handleOpenChange = (nextOpen: boolean) => {
    if (
      !nextOpen &&
      (title.trim() || description.trim() || goal !== "none") &&
      !window.confirm("未保存の入力があります。閉じますか？")
    )
      return;
    onOpenChange(nextOpen);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd({
      id: makeId("memory"),
      title: title.trim(),
      description: description.trim(),
      date,
      relatedGoal: goal === "none" ? null : goal,
      relatedTask: null,
      imageUrl: null,
    });
    setTitle("");
    setDescription("");
    setGoal("none");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>思い出を残す</DialogTitle>
          <DialogDescription>
            達成だけでなく、途中で心に残ったことも記録できます。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="memory-title">タイトル</Label>
            <Input
              id="memory-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例：初めて画面が動いた日"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="memory-description">記録</Label>
            <Textarea
              id="memory-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="何が起きて、どう感じたか"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="memory-date">日付</Label>
              <Input
                id="memory-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>関連Goal</Label>
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">関連付けない</SelectItem>
                  {data.goals.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              記録する
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained until the post-backup rollout can remove the legacy view safely
function Dashboard({
  data,
  now,
  currentMonth,
  onNavigate,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onAddTask,
}: {
  data: RoadmapData;
  now: Date;
  currentMonth: RoadmapMonth;
  onNavigate: (page: Page) => void;
  onToggleTask: (id: string) => void;
  onEditTask: (id: string, title: string) => void;
  onDeleteTask: (id: string) => void;
  onAddTask: () => void;
}) {
  const completed = data.tasks.filter((task) => task.completed).length;
  const goalProgress = taskCompletion(data.tasks);
  const roadmapStart = new Date(`${data.settings.startDate}T00:00:00`);
  const roadmapEnd = new Date(`${data.settings.targetDate}T00:00:00`);
  const timeProgress = clamp(
    Math.round(
      ((now.getTime() - roadmapStart.getTime()) /
        Math.max(1, roadmapEnd.getTime() - roadmapStart.getTime())) *
        100,
    ),
  );
  const daysLeft = Math.max(
    0,
    Math.ceil((roadmapEnd.getTime() - now.getTime()) / 86_400_000),
  );
  const isBefore = now < roadmapStart;
  const isComplete = now >= roadmapEnd;
  const currentTasks = data.tasks.filter(
    (task) => task.month === currentMonth.id,
  );
  const nextTasks = currentTasks
    .filter((task) => !task.completed)
    .sort(
      (a, b) =>
        ({ high: 0, medium: 1, low: 2 })[a.priority] -
        { high: 0, medium: 1, low: 2 }[b.priority],
    )
    .slice(0, 3);
  const focusTasks = currentTasks
    .filter((task) => task.priority === "high")
    .slice(0, 3);
  const visibleFocus =
    focusTasks.length >= 3 ? focusTasks : currentTasks.slice(0, 3);
  const categoryCounts = Object.keys(CATEGORY_META)
    .map((category) => ({
      category: category as Category,
      count: data.tasks.filter((task) => task.category === category).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-primary/15 bg-[var(--hero)] p-5 text-[var(--hero-ink)] shadow-[0_18px_60px_-38px_color-mix(in_srgb,var(--primary)_55%,transparent)] sm:p-8 lg:p-10">
        <div
          className="absolute right-[-70px] top-[-90px] size-64 rounded-full border-[36px] border-primary/5"
          aria-hidden="true"
        />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Badge className="border-0 bg-primary/10 text-[var(--hero-ink)] hover:bg-primary/10">
                {isBefore
                  ? "ROADMAP STARTS SOON"
                  : isComplete
                    ? "ROADMAP COMPLETED"
                    : "EVENT DAY"}
              </Badge>
              <span className="text-sm text-[color:color-mix(in_srgb,var(--hero-ink)_68%,transparent)]">
                {data.settings.eventName}までのロードマップ
              </span>
            </div>
            <p className="text-sm font-medium text-[color:color-mix(in_srgb,var(--hero-ink)_72%,transparent)]">
              {data.settings.eventName}まで
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-[clamp(3.5rem,8vw,6.5rem)] font-semibold leading-none tracking-[-0.075em]">
                {daysLeft}
              </span>
              <span className="text-lg font-medium tracking-[0.12em] sm:text-xl">
                DAYS
              </span>
            </div>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-[color:color-mix(in_srgb,var(--hero-ink)_72%,transparent)]">
              {isComplete
                ? "積み重ねた学びと経験を振り返り、次のロードマップへ。"
                : `今月のテーマは「${currentMonth.theme}」。次の一歩が見える範囲に集中します。`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-primary/10 bg-primary/10">
            {[
              ["Goal Progress", `${goalProgress}%`],
              ["Time Progress", `${timeProgress}%`],
              ["Completed", `${completed} / ${data.tasks.length}`],
              ["This Month", `${currentMonth.short} ${currentMonth.year}`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="bg-[color:color-mix(in_srgb,var(--hero)_88%,white)] p-4 dark:bg-[color:color-mix(in_srgb,var(--hero)_88%,black)] sm:p-5"
              >
                <p className="text-xs text-[color:color-mix(in_srgb,var(--hero-ink)_60%,transparent)]">
                  {label}
                </p>
                <p className="mt-1 text-lg font-semibold tracking-[-0.03em] sm:text-xl">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Pace
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em]">
                時間と目標の進み方
              </h2>
            </div>
            <Clock3 className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span>Goal Progress</span>
                <span className="font-medium">{goalProgress}%</span>
              </div>
              <Progress value={goalProgress} className="h-2.5 bg-primary/10" />
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span>Time Progress</span>
                <span className="font-medium">{timeProgress}%</span>
              </div>
              <Progress
                value={timeProgress}
                className="h-2.5 bg-muted [&_[data-slot=progress-indicator]]:bg-muted-foreground/55"
              />
            </div>
          </div>
          <p className="mt-5 rounded-xl bg-muted/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
            {goalProgress + 6 < timeProgress
              ? `今月は「${nextTasks
                  .slice(0, 3)
                  .map((task) => task.title)
                  .join("」「")}」を優先。`
              : "今のペースを保ちながら、経験や気づきも記録していきます。"}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Balance
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em]">
                ロードマップの配分
              </h2>
            </div>
            <Layers3 className="size-5 text-muted-foreground" />
          </div>
          <SegmentedCategoryBar tasks={data.tasks} />
          <div className="mt-5 space-y-3">
            {categoryCounts.map(({ category, count }) => (
              <div key={category} className="flex items-center gap-3 text-sm">
                <CategoryPill category={category} compact />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full bg-[var(--category)]",
                      CATEGORY_META[category].className,
                    )}
                    style={{ width: `${(count / data.tasks.length) * 240}%` }}
                  />
                </div>
                <span className="w-6 text-right text-muted-foreground">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.08fr_.92fr]">
        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <SectionHeading
            eyebrow="This Month"
            title={`${currentMonth.label} — ${currentMonth.theme}`}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("roadmap")}
                className="gap-1 text-muted-foreground"
              >
                すべて見る
                <ChevronRight className="size-4" />
              </Button>
            }
          />
          <p className="mb-6 text-sm leading-6 text-muted-foreground">
            {currentMonth.mainFocus}
          </p>
          <ol className="space-y-2">
            {visibleFocus.map((task, index) => (
              <li
                key={task.id}
                className="flex items-center gap-4 rounded-xl bg-[var(--surface-subtle)] px-4 py-3.5"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "flex-1 text-[15px]",
                    task.completed && "text-muted-foreground line-through",
                  )}
                >
                  {task.title}
                </span>
                {task.completed ? (
                  <CheckCircle2 className="size-4 text-[var(--success)]" />
                ) : (
                  <span className="size-2 rounded-full bg-primary/35" />
                )}
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <SectionHeading
            eyebrow="Today / Next"
            title="次にやるならこれ"
            action={
              <Button variant="outline" size="sm" onClick={onAddTask}>
                <Plus className="size-4" />
                追加
              </Button>
            }
          />
          <div className="space-y-1">
            {nextTasks.length ? (
              nextTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => onToggleTask(task.id)}
                  onEdit={(title) => onEditTask(task.id, title)}
                  onDelete={() => onDeleteTask(task.id)}
                />
              ))
            ) : (
              <div className="rounded-xl bg-muted/60 px-5 py-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 size-6 text-[var(--success)]" />
                <p className="font-medium">今月のタスクはすべて完了しました</p>
                <Button variant="link" onClick={onAddTask}>
                  次の一歩を追加
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
      <section>
        <SectionHeading
          eyebrow="Goals"
          title="大きな目標の現在地"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("goals")}
              className="gap-1 text-muted-foreground"
            >
              すべて見る
              <ChevronRight className="size-4" />
            </Button>
          }
        />
        <div className="grid gap-4 md:grid-cols-3">
          {data.goals.slice(0, 3).map((goal) => {
            const progress = getGoalProgress(goal, data.tasks);
            return (
              <button
                key={goal.id}
                onClick={() => onNavigate("goals")}
                className="rounded-2xl border bg-card p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none"
              >
                <div className="mb-4 flex items-start justify-between">
                  <CategoryPill category={goal.category} compact />
                  <span className="text-sm font-medium">{progress}%</span>
                </div>
                <h3 className="font-semibold tracking-[-0.02em]">
                  {goal.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {goal.titleJa}
                </p>
                <Progress
                  value={progress}
                  className="mt-5 h-1.5 bg-primary/10"
                />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProgressRing({
  value,
  completed,
  total,
  label,
}: {
  value: number;
  completed: number;
  total: number;
  label: string;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamp(value) / 100) * circumference;
  return (
    <div
      className="progress-ring relative grid size-[190px] shrink-0 place-items-center lg:size-[216px]"
      role="progressbar"
      aria-label="全体進捗"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`全体進捗${value}パーセント、${completed}件中${total}件完了、${label}`}
    >
      <svg
        className="absolute inset-0 size-full -rotate-90"
        viewBox="0 0 128 128"
        aria-hidden="true"
      >
        <circle
          className="progress-ring-track"
          cx="64"
          cy="64"
          r={radius}
          pathLength="100"
        />
        <circle
          className="progress-ring-value"
          cx="64"
          cy="64"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="relative text-center">
        <p className="text-[13px] font-medium text-muted-foreground">
          全体進捗
        </p>
        <p className="mt-1 text-[3.25rem] font-semibold leading-none tracking-[-0.075em]">
          {value}
          <span className="ml-0.5 text-xl tracking-normal">%</span>
        </p>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {completed} / {total} 完了
        </p>
        <p className="mt-1 text-[12px] font-medium text-primary">{label}</p>
      </div>
    </div>
  );
}

function ProgressMetric({
  label,
  value,
  detail,
  tone = "blue",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "blue" | "green" | "orange";
}) {
  return (
    <div className="ios-metric rounded-[18px] bg-[var(--surface-subtle)] p-3 sm:p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <p className="text-[12px] font-medium text-muted-foreground sm:text-[13px]">
          {label}
        </p>
        <p className="text-xl font-semibold tracking-[-0.04em]">{value}%</p>
      </div>
      <div
        className={cn("progress-track mt-3", `progress-${tone}`)}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span style={{ width: `${value}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground sm:text-[12px] sm:leading-5">
        {detail}
      </p>
    </div>
  );
}

function DashboardV2({
  data,
  now,
  currentMonth,
  onNavigate,
  onOpenMonth,
  onToggleTask,
  onAddTask,
  onAskAI,
}: {
  data: RoadmapData;
  now: Date;
  currentMonth: RoadmapMonth;
  onNavigate: (page: Page) => void;
  onOpenMonth: (id: string) => void;
  onToggleTask: (id: string) => void;
  onAddTask: () => void;
  onAskAI: AskAIHandler;
}) {
  const tasks = activeTasks(data.tasks);
  const total = tasks.length;
  const completed = completedTaskCount(tasks);
  const overallProgress = taskCompletion(tasks);
  const roadmapStart = new Date(
    `${data.months[0]?.id ?? toDateKey(now).slice(0, 7)}-01T00:00:00`,
  );
  const roadmapEnd = new Date(`${data.settings.targetDate}T00:00:00`);
  const duration = Math.max(1, roadmapEnd.getTime() - roadmapStart.getTime());
  const timeProgress = clamp(
    Math.round(((now.getTime() - roadmapStart.getTime()) / duration) * 100),
  );
  const daysLeft = Math.max(
    0,
    Math.ceil((roadmapEnd.getTime() - now.getTime()) / 86_400_000),
  );
  const isBefore = now < roadmapStart;
  const isComplete = now >= roadmapEnd;
  const currentTasks = tasks.filter((task) => task.month === currentMonth.id);
  const currentProgress = taskCompletion(currentTasks);
  const nextTasks = currentTasks
    .filter((task) => getTaskProgress(task) < 100)
    .sort(
      (a, b) =>
        ({ high: 0, medium: 1, low: 2 })[a.priority] -
        { high: 0, medium: 1, low: 2 }[b.priority],
    )
    .slice(0, 3);
  const stateLabel = isComplete
    ? "ロードマップ完了"
    : isBefore
      ? "まもなくスタート"
      : overallProgress + 6 >= timeProgress
        ? "着実に進行中"
        : "今月の一歩に集中";
  const currentDate = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(now);
  const categoryStats = (Object.keys(CATEGORY_META) as Category[])
    .map((category) => {
      const categoryTasks = tasks.filter((task) => task.category === category);
      return {
        category,
        tasks: categoryTasks,
        progress: taskCompletion(categoryTasks),
        completed: completedTaskCount(categoryTasks),
        next: categoryTasks.find((task) => getTaskProgress(task) < 100),
      };
    })
    .filter((item) => item.tasks.length > 0);

  if (!tasks.length)
    return (
      <div className="space-y-8">
        <section className="px-1 pt-1">
          <p className="text-sm font-medium text-primary">
            {data.settings.targetDate}まで
          </p>
          <h1 className="mt-1 text-[clamp(2.25rem,5vw,4.5rem)] font-semibold leading-[1.06] tracking-[-0.06em]">
            {data.settings.roadmapName}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            {data.settings.finalGoal}
          </p>
        </section>
        <section
          data-guide="progress"
          className="ios-surface rounded-[28px] p-6 sm:p-8"
        >
          <div className="grid gap-6 sm:grid-cols-[180px_1fr] sm:items-center">
            <ProgressRing
              value={0}
              completed={0}
              total={0}
              label="最初の一歩を待っています"
            />
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.035em]">
                進捗はタスクから始まります
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                タスクを進行中または完了にすると、全体・今月・カテゴリの進み方がここに表示されます。
              </p>
              <Button
                data-guide="add-task"
                className="mt-6 h-12 rounded-xl"
                onClick={onAddTask}
              >
                <Plus className="size-4" />
                タスクを追加する
              </Button>
            </div>
          </div>
        </section>
        <section className="ios-surface rounded-[24px] p-6 text-center">
          <Target className="mx-auto size-7 text-primary" />
          <h2 className="mt-4 text-xl font-semibold">
            目標へ近づくための、小さなタスクを追加しましょう
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            目標がまだない場合は、Goalsから最初の目標も作れます。
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onNavigate("goals")}>
              目標を見る
            </Button>
            <Button onClick={onAddTask}>今月のタスクを決める</Button>
          </div>
        </section>
      </div>
    );

  return (
    <div className="space-y-8 lg:space-y-10">
      <section aria-labelledby="dashboard-title" className="px-1 pt-1 sm:px-0">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              {new Intl.DateTimeFormat("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
              }).format(roadmapEnd)}
              {isComplete ? "" : "まで"}
            </p>
            <h1
              id="dashboard-title"
              className="mt-1 text-[clamp(2.25rem,5vw,4.75rem)] font-semibold leading-[1.04] tracking-[-0.065em] text-balance"
            >
              <span className="block max-w-4xl truncate text-[0.42em] leading-[1.5] tracking-[-0.03em] text-foreground/70">
                {data.settings.eventName}
              </span>
              あと <span className="tabular-nums text-primary">{daysLeft}</span>{" "}
              日
            </h1>
          </div>
          <div className="sm:text-right">
            <p className="text-sm font-medium">{currentDate}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentMonth.year}年{currentMonth.month}月 · {currentMonth.theme}
            </p>
          </div>
        </div>
      </section>

      <section
        data-guide="progress"
        className="ios-surface overflow-hidden rounded-[28px] p-5 sm:p-7 lg:p-8"
        aria-label="進捗サマリー"
      >
        <div className="grid gap-7 md:grid-cols-[210px_1fr] md:items-center lg:grid-cols-[250px_1fr]">
          <div className="grid place-items-center md:border-r md:border-[var(--separator)]">
            <ProgressRing
              value={overallProgress}
              completed={completed}
              total={total}
              label={stateLabel}
            />
          </div>
          <div>
            <div className="mb-5">
              <p className="text-[13px] font-medium text-muted-foreground">
                進み方を3つの角度で見る
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">
                時間と達成を、別々に。
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <ProgressMetric
                label="計画期間"
                value={timeProgress}
                detail={
                  isBefore
                    ? "開始前の準備期間"
                    : isComplete
                      ? "計画期間が終了"
                      : `残り${daysLeft}日`
                }
                tone="orange"
              />
              <ProgressMetric
                label="全タスク"
                value={overallProgress}
                detail={`${completed}/${total} 完了`}
                tone="blue"
              />
              <ProgressMetric
                label="今月"
                value={currentProgress}
                detail={`${completedTaskCount(currentTasks)}/${currentTasks.length} 完了`}
                tone="green"
              />
            </div>
            <p className="mt-5 rounded-2xl bg-primary/[0.07] px-4 py-3 text-sm leading-6 text-foreground/80">
              {overallProgress + 6 < timeProgress && nextTasks.length
                ? `まずは「${nextTasks[0].title}」から。今月の3つに集中すれば大丈夫です。`
                : "時間の進み方と比べながら、今月できる一歩を積み重ねます。"}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="focus-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="ios-eyebrow">This Month</p>
            <h2 id="focus-title" className="ios-title">
              {currentMonth.label} · {currentMonth.theme}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenMonth(currentMonth.id)}
            className="ios-link"
          >
            月の詳細
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="ios-surface rounded-[24px] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-primary">今月のテーマ</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  {currentMonth.theme}
                </p>
              </div>
              <div className="rounded-2xl bg-primary/10 px-3 py-2 text-right">
                <p className="text-2xl font-semibold text-primary">
                  {currentProgress}%
                </p>
                <p className="text-[11px] text-muted-foreground">
                  今月の達成率
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {currentMonth.mainFocus}
            </p>
            <Button
              data-guide="add-task"
              variant="outline"
              onClick={onAddTask}
              className="mt-6 h-11 w-full rounded-xl"
            >
              <Plus className="size-4" />
              今月にタスクを追加
            </Button>
          </div>
          <div className="ios-surface overflow-hidden rounded-[24px] p-2">
            <div className="flex items-center justify-between px-3 pb-2 pt-3">
              <div>
                <p className="text-sm font-semibold">次にやるならこれ</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  優先度の高い順に最大3件
                </p>
              </div>
              <ArrowUpRight className="size-5 text-primary" />
            </div>
            {nextTasks.length ? (
              <div className="divide-y divide-[var(--separator)]">
                {nextTasks.map((task) => {
                  const progress = getTaskProgress(task);
                  return (
                    <article
                      key={task.id}
                      className="grid grid-cols-[44px_1fr] gap-3 px-3 py-3.5 sm:grid-cols-[44px_1fr_auto] sm:items-center"
                    >
                      <button
                        onClick={() => onToggleTask(task.id)}
                        className="ios-press grid size-11 place-items-center rounded-full bg-[var(--surface-subtle)]"
                        aria-label={`${task.title}を完了にする`}
                      >
                        <Circle className="size-6 text-muted-foreground" />
                      </button>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-[15px] font-semibold">
                            {task.title}
                          </h3>
                          {task.priority === "high" ? (
                            <span className="rounded-full bg-[color:color-mix(in_srgb,var(--warning)_12%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--warning)]">
                              優先
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {task.dueDate
                            ? `${formatShortDate(task.dueDate)}まで`
                            : "今週"}{" "}
                          · {getTaskStatus(task)}
                        </p>
                        <p className="mt-1.5 truncate text-[13px] text-foreground/75">
                          次の一歩：
                          {task.nextAction ||
                            `「${task.title}」を15分だけ進める`}
                        </p>
                      </div>
                      <div className="col-start-2 flex min-w-24 items-center gap-2 sm:col-start-auto">
                        <div className="min-w-20 flex-1">
                          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                            <span>進捗</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="progress-track progress-blue">
                            <span style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                        <AskAIButton task={task} onAskAI={onAskAI} compact />
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="m-2 rounded-2xl bg-[var(--surface-subtle)] p-8 text-center">
                <CheckCircle2 className="mx-auto size-7 text-[var(--success)]" />
                <p className="mt-3 font-medium">今月のタスクは完了しています</p>
                <Button variant="link" onClick={onAddTask}>
                  次の一歩を追加
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="journey-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="ios-eyebrow">Road to Goal</p>
            <h2 id="journey-title" className="ios-title">
              目標日までのロードマップ
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate("roadmap")}
            className="ios-link"
          >
            全体を見る
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="ios-surface rounded-[24px] px-4 py-5 sm:px-5">
          <div
            className="month-journey scrollbar-none"
            aria-label={`${data.months[0]?.id}から${data.settings.targetDate}までのロードマップ`}
          >
            {data.months.map((month, index) => {
              const monthTasks = tasks.filter(
                (task) => task.month === month.id,
              );
              const progress = taskCompletion(monthTasks);
              const done = completedTaskCount(monthTasks);
              const current =
                month.id === currentMonth.id && !isBefore && !isComplete;
              const monthDate = new Date(month.year, month.month - 1, 1);
              const past =
                monthDate < new Date(now.getFullYear(), now.getMonth(), 1);
              const goal = index === data.months.length - 1;
              return (
                <button
                  key={month.id}
                  onClick={() => onOpenMonth(month.id)}
                  className={cn(
                    "month-step ios-press",
                    current && "is-current",
                    (past || progress === 100) && !current && "is-past",
                    goal && "is-goal",
                  )}
                  aria-current={current ? "step" : undefined}
                  aria-label={`${month.year}年${month.month}月、${month.theme}、進捗${progress}パーセント、${done}/${monthTasks.length}完了`}
                >
                  <span className="month-node">
                    {goal ? (
                      <Flag className="size-4" />
                    ) : progress === 100 ? (
                      <Check className="size-4" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="mt-3 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">
                    {month.short}
                  </span>
                  <span className="mt-1 line-clamp-2 min-h-10 text-[13px] font-medium leading-5">
                    {month.theme}
                  </span>
                  <span className="mt-2 text-[12px] tabular-nums text-muted-foreground">
                    {progress}% · {done}/{monthTasks.length}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--separator)] pt-4 text-[12px] text-muted-foreground">
            <span>
              {data.months[0]?.year}年{data.months[0]?.month}月 · スタート
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              <Flag className="size-3.5" />
              {data.settings.targetDate} · Goal
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="categories-title">
        <div className="mb-4">
          <p className="ios-eyebrow">Categories</p>
          <h2 id="categories-title" className="ios-title">
            分野ごとの現在地
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            項目数ではなく、各タスクの達成度を平均しています。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {categoryStats.map(
            ({
              category,
              tasks: categoryTasks,
              progress,
              completed: categoryCompleted,
              next,
            }) => {
              const Icon = CATEGORY_ICONS[category];
              return (
                <article
                  key={category}
                  className={cn(
                    "ios-surface category-card rounded-[22px] p-5",
                    CATEGORY_META[category].className,
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--category-bg)] text-[var(--category)]">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-semibold">
                          {CATEGORY_META[category].label}
                        </h3>
                        <span className="text-lg font-semibold tabular-nums">
                          {progress}%
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {categoryCompleted} / {categoryTasks.length} 完了
                      </p>
                      <div className="progress-track mt-3">
                        <span
                          className="bg-[var(--category)]"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="mt-2 flex min-w-0 items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                          <span className="font-medium text-foreground/75">
                            次：
                          </span>
                          {next?.title ?? "この分野は完了しています"}
                        </p>
                        {next ? (
                          <AskAIButton task={next} onAskAI={onAskAI} compact />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            },
          )}
        </div>
      </section>
    </div>
  );
}

function RoadmapView({
  data,
  now,
  selectedMonthId,
  setSelectedMonthId,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onAddTask,
  updateMonth,
  onAskAI,
}: {
  data: RoadmapData;
  now: Date;
  selectedMonthId: string | null;
  setSelectedMonthId: (id: string | null) => void;
  onToggleTask: (id: string) => void;
  onEditTask: (id: string, title: string) => void;
  onDeleteTask: (id: string) => void;
  onAddTask: (month: string) => void;
  updateMonth: (month: RoadmapMonth) => void;
  onAskAI: AskAIHandler;
}) {
  const currentId = getCurrentMonthId(now, data.months);
  const targetDate = new Date(`${data.settings.targetDate}T00:00:00`);
  const lastMonthId = data.months.at(-1)?.id;
  const selected = data.months.find((month) => month.id === selectedMonthId);
  if (selected) {
    const tasks = activeTasks(data.tasks).filter(
      (task) => task.month === selected.id,
    );
    const relatedGoalIds = new Set(
      tasks.map((task) => task.goalId).filter(Boolean),
    );
    const relatedGoals = data.goals.filter((goal) =>
      relatedGoalIds.has(goal.id),
    );
    const memories = data.memories.filter((memory) => {
      const relatedTask = memory.relatedTask
        ? data.tasks.find((task) => task.id === memory.relatedTask)
        : null;
      return (
        relatedTask?.month === selected.id ||
        (memory.relatedGoal &&
          relatedGoals.some((goal) => goal.id === memory.relatedGoal))
      );
    });
    const progress = taskCompletion(tasks);
    return (
      <div className="space-y-7">
        <Button
          variant="ghost"
          onClick={() => setSelectedMonthId(null)}
          className="-ml-3 gap-2 text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          ロードマップへ戻る
        </Button>
        <section
          className={cn(
            "rounded-[26px] border p-6 sm:p-8",
            selected.id === lastMonthId
              ? "border-primary/20 bg-[var(--hero)]"
              : "bg-card",
          )}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">
                  {selected.short} {selected.year}
                </span>
                {selected.id === currentId && now < targetDate ? (
                  <Badge>CURRENT</Badge>
                ) : null}
                {selected.id === lastMonthId ? (
                  <Badge variant="outline">
                    <Flag className="mr-1 size-3" />
                    GOAL
                  </Badge>
                ) : null}
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                {selected.theme}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                {selected.mainFocus}
              </p>
            </div>
            <div className="min-w-40">
              <div className="mb-2 flex justify-between text-sm">
                <span>Progress</span>
                <strong>{progress}%</strong>
              </div>
              <Progress value={progress} />
            </div>
          </div>
        </section>
        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <SectionHeading
              eyebrow="Tasks"
              title="今月のタスク"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddTask(selected.id)}
                >
                  <Plus className="size-4" />
                  Add Task
                </Button>
              }
            />
            {tasks.length ? (
              <div className="space-y-1">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => onToggleTask(task.id)}
                    onEdit={(title) => onEditTask(task.id, title)}
                    onDelete={() => onDeleteTask(task.id)}
                    onAskAI={onAskAI}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-muted/60 px-5 py-10 text-center">
                <NotebookPen className="mx-auto mb-3 size-6 text-muted-foreground" />
                <p className="font-medium">今月の予定はまだありません</p>
                <Button variant="link" onClick={() => onAddTask(selected.id)}>
                  タスクを追加
                </Button>
              </div>
            )}
          </section>
          <div className="space-y-6">
            <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold">関連Goal</h2>
              <div className="mt-4 space-y-3">
                {relatedGoals.length ? (
                  relatedGoals.map((goal) => (
                    <div key={goal.id} className="rounded-xl bg-muted/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{goal.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {goal.titleJa}
                          </p>
                        </div>
                        <span className="text-sm font-semibold">
                          {getGoalProgress(goal, data.tasks)}%
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    関連するGoalはまだありません。
                  </p>
                )}
              </div>
            </section>
            <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold">Notes</h2>
              <Textarea
                className="mt-4 min-h-28 resize-y border-0 bg-muted/55 shadow-none focus-visible:ring-1"
                placeholder="今月の考えや準備を書いておく"
                value={selected.notes}
                onChange={(event) =>
                  updateMonth({ ...selected, notes: event.target.value })
                }
              />
            </section>
          </div>
        </div>
        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <SectionHeading
            eyebrow={`${selected.label} Review`}
            title="月の振り返り"
          />
          <div className="grid gap-5 md:grid-cols-2">
            {[
              ["accomplished", "できたこと", "小さな前進も含めて記録"],
              ["memorable", "印象に残ったこと", "人、場所、言葉、出来事"],
              ["next", "来月やりたいこと", "次に持っていきたい一歩"],
              ["notes", "自由メモ", "まだまとまっていない考えでも大丈夫"],
            ].map(([key, label, placeholder]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`review-${key}`}>{label}</Label>
                <Textarea
                  id={`review-${key}`}
                  placeholder={placeholder}
                  value={selected.review[key as keyof typeof selected.review]}
                  onChange={(event) =>
                    updateMonth({
                      ...selected,
                      review: { ...selected.review, [key]: event.target.value },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>
        <section>
          <SectionHeading eyebrow="Memories" title="この月につながる記録" />
          {memories.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {memories.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  goal={data.goals.find(
                    (goal) => goal.id === memory.relatedGoal,
                  )}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              この月の思い出は、これから増えていきます。
            </p>
          )}
        </section>
      </div>
    );
  }
  return (
    <div>
      <SectionHeading
        eyebrow={`${data.months[0]?.label ?? "Start"} — ${data.months.at(-1)?.label ?? "Goal"}`}
        title="月ごとのロードマップ"
      />
      <p className="mb-8 max-w-2xl text-[15px] leading-7 text-muted-foreground">
        各月は独立したTodoではなく、目標日へつながる一つの時間軸です。月を開くと、タスク・Goal・振り返りをまとめて確認できます。
      </p>
      <div className="relative space-y-4 before:absolute before:bottom-8 before:left-[23px] before:top-8 before:w-px before:bg-border sm:before:left-[31px]">
        {data.months.map((month) => {
          const tasks = activeTasks(data.tasks).filter(
            (task) => task.month === month.id,
          );
          const completed = completedTaskCount(tasks);
          const progress = taskCompletion(tasks);
          const firstMonth = data.months[0];
          const startsAt = firstMonth
            ? new Date(firstMonth.year, firstMonth.month - 1, 1)
            : now;
          const current =
            month.id === currentId && now >= startsAt && now < targetDate;
          const past =
            new Date(month.year, month.month - 1, 1) <
            new Date(now.getFullYear(), now.getMonth(), 1);
          const isGoal = month.id === lastMonthId;
          return (
            <div
              key={month.id}
              className="relative grid grid-cols-[48px_1fr] gap-3 sm:grid-cols-[64px_1fr] sm:gap-5"
            >
              <div
                className={cn(
                  "relative z-[1] mt-7 grid size-12 place-items-center rounded-full border-4 border-background bg-card text-xs font-semibold shadow-sm sm:size-16",
                  current && "bg-primary text-primary-foreground",
                  isGoal &&
                    "border-[var(--hero)] bg-[var(--hero-ink)] text-white",
                  past && !isGoal && "text-muted-foreground",
                )}
              >
                {isGoal ? <Flag className="size-5" /> : month.short}
              </div>
              <button
                onClick={() => setSelectedMonthId(month.id)}
                className={cn(
                  "ios-press group rounded-[22px] border border-[var(--separator)] bg-card p-5 text-left shadow-[var(--shadow-card)] transition duration-200 hover:border-primary/25 sm:p-6",
                  past && !current && "bg-card/70",
                  current &&
                    "border-primary/35 shadow-[0_14px_38px_-28px_var(--primary)]",
                  isGoal && "border-primary/20 bg-[var(--hero)]",
                )}
              >
                <div className="grid gap-5 lg:grid-cols-[1fr_190px] lg:items-center">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground">
                        {month.year} {month.short}
                      </span>
                      {current ? <Badge>CURRENT</Badge> : null}
                      {isGoal ? (
                        <Badge variant="outline">NEW CHAPTER</Badge>
                      ) : null}
                    </div>
                    <h2 className="text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
                      {month.theme}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {month.mainFocus}
                    </p>
                    <p className="mt-4 text-sm">
                      <span className="text-muted-foreground">Main focus</span>
                      <span className="ml-2">
                        {tasks.find((task) => task.priority === "high")
                          ?.title ?? tasks[0]?.title}
                      </span>
                    </p>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {completed} / {tasks.length} completed
                      </span>
                      <strong>{progress}%</strong>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="mt-4">
                      <SegmentedCategoryBar tasks={tasks} />
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm text-primary opacity-70 transition group-hover:opacity-100">
                      詳細を見る
                      <ChevronRight className="size-4" />
                    </span>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoalsView({
  data,
  selectedGoalId,
  setSelectedGoalId,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onToggleGoal,
  onAddGoal,
  onUpdateGoal,
  onAskAI,
}: {
  data: RoadmapData;
  selectedGoalId: string | null;
  setSelectedGoalId: (id: string | null) => void;
  onToggleTask: (id: string) => void;
  onEditTask: (id: string, title: string) => void;
  onDeleteTask: (id: string) => void;
  onToggleGoal: (id: string) => void;
  onAddGoal: () => void;
  onUpdateGoal: (goal: Goal) => void;
  onAskAI: AskAIHandler;
}) {
  const selected = data.goals.find((goal) => goal.id === selectedGoalId);
  if (!selected && !data.goals.length)
    return (
      <div>
        <SectionHeading eyebrow="Goals" title="大きな目標" />
        <div className="rounded-[24px] border border-dashed border-primary/25 bg-card p-8 text-center sm:p-12">
          <Target className="mx-auto size-8 text-primary" />
          <h2 className="mt-4 text-xl font-semibold">
            目標日までにやってみたいことを登録しましょう
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            最初は一つだけで構いません。あとから内容やカテゴリを変更できます。
          </p>
          <Button className="mt-6 h-12 rounded-xl" onClick={onAddGoal}>
            <Plus className="size-4" />
            最初の目標を作る
          </Button>
        </div>
      </div>
    );
  if (selected) {
    const relatedTasks = data.tasks.filter(
      (task) => task.goalId === selected.id,
    );
    const relatedMonths = data.months.filter((month) =>
      relatedTasks.some((task) => task.month === month.id),
    );
    const progress = getGoalProgress(selected, data.tasks);
    return (
      <div className="space-y-7">
        <Button
          variant="ghost"
          onClick={() => setSelectedGoalId(null)}
          className="-ml-3 gap-2 text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Goalsへ戻る
        </Button>
        <section
          className={cn(
            "relative overflow-hidden rounded-[28px] border p-6 sm:p-9",
            CATEGORY_META[selected.category].className,
          )}
          style={{
            background: "var(--category-bg)",
            borderColor: "color-mix(in srgb, var(--category) 24%, transparent)",
          }}
        >
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CategoryPill category={selected.category} />
              <p className="mt-6 text-sm font-medium uppercase tracking-[0.12em] text-[var(--category)]">
                Personal Goal
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                {selected.title}
              </h1>
              <p className="mt-2 text-lg text-foreground/70">
                {selected.titleJa}
              </p>
              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground">
                {selected.description}
              </p>
            </div>
            <div className="min-w-52 rounded-2xl bg-card/75 p-5 backdrop-blur-sm">
              <div className="flex items-end justify-between">
                <span className="text-sm text-muted-foreground">Progress</span>
                <span className="text-3xl font-semibold tracking-[-0.05em]">
                  {progress}%
                </span>
              </div>
              <Progress value={progress} className="mt-4" />
              <Button
                className="mt-5 w-full"
                variant={selected.completedAt ? "outline" : "default"}
                onClick={() => onToggleGoal(selected.id)}
              >
                {selected.completedAt ? "完了を取り消す" : "Goalを完了する"}
              </Button>
            </div>
          </div>
        </section>
        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <SectionHeading
              eyebrow="Related Tasks"
              title="このGoalにつながるタスク"
            />
            {relatedTasks.length ? (
              <div className="space-y-1">
                {relatedTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => onToggleTask(task.id)}
                    onEdit={(title) => onEditTask(task.id, title)}
                    onDelete={() => onDeleteTask(task.id)}
                    onAskAI={onAskAI}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-muted/60 p-8 text-center text-sm text-muted-foreground">
                関連タスクはまだありません。
              </p>
            )}
          </section>
          <div className="space-y-6">
            <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold">Related Months</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {relatedMonths.map((month) => (
                  <span
                    key={month.id}
                    className="rounded-lg bg-muted px-3 py-2 text-sm"
                  >
                    {month.short} {month.year}
                  </span>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold">Notes</h2>
              <Textarea
                className="mt-4 min-h-28 resize-y border-0 bg-muted/55 shadow-none focus-visible:ring-1"
                placeholder="このGoalで考えたことや判断を記録"
                value={selected.notes}
                onChange={(event) =>
                  onUpdateGoal({ ...selected, notes: event.target.value })
                }
              />
            </section>
            <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold">Completion</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                完了すると達成カードが表示され、Memoriesに自動で記録されます。
              </p>
              {selected.completedAt ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-[color:color-mix(in_srgb,var(--success)_12%,transparent)] p-4 text-sm text-[var(--success)]">
                  <Trophy className="size-5" />
                  {formatShortDate(selected.completedAt)} に完了
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <SectionHeading
        eyebrow="Goals"
        title={`${data.settings.eventName}までに形にしたいこと`}
        action={
          <Button onClick={onAddGoal}>
            <Plus className="size-4" />
            Goalを追加
          </Button>
        }
      />
      <p className="mb-8 max-w-2xl text-[15px] leading-7 text-muted-foreground">
        Goalはタスクの数ではなく、最終的に残したい成果や経験です。カードを開くと、そのGoalにつながる月とタスクが見えます。
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.goals.map((goal) => {
          const progress = getGoalProgress(goal, data.tasks);
          return (
            <button
              key={goal.id}
              onClick={() => setSelectedGoalId(goal.id)}
              className={cn(
                "group relative min-h-56 overflow-hidden rounded-2xl border bg-card p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md",
                goal.completedAt &&
                  "border-[color:color-mix(in_srgb,var(--success)_35%,transparent)]",
              )}
            >
              <div className="flex items-start justify-between">
                <CategoryPill category={goal.category} compact />
                {goal.completedAt ? (
                  <CheckCircle2 className="size-5 text-[var(--success)]" />
                ) : (
                  <span className="text-sm font-medium">{progress}%</span>
                )}
              </div>
              <h2 className="mt-7 text-xl font-semibold tracking-[-0.03em]">
                {goal.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {goal.titleJa}
              </p>
              <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
                {goal.description}
              </p>
              <div className="absolute bottom-5 left-5 right-5">
                <Progress value={progress} className="h-1.5" />
                <span className="mt-3 flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  詳細を見る
                  <ChevronRight className="size-3" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MemoryCard({ memory, goal }: { memory: Memory; goal?: Goal }) {
  const date = new Date(`${memory.date}T00:00:00`);
  return (
    <article className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="text-primary">
          <p className="font-mono text-2xl font-semibold tracking-[-0.05em]">
            {String(date.getDate()).padStart(2, "0")}
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {date.toLocaleString("en-US", { month: "short" })}{" "}
            {date.getFullYear()}
          </p>
        </div>
        {goal ? (
          <CategoryPill category={goal.category} compact />
        ) : (
          <Sparkles className="size-5 text-muted-foreground" />
        )}
      </div>
      <h2 className="text-lg font-semibold tracking-[-0.025em]">
        {memory.title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {memory.description ||
          "この日のことを思い出せるように、あとから言葉を足せます。"}
      </p>
      {goal ? (
        <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
          Related to{" "}
          <span className="font-medium text-foreground">{goal.title}</span>
        </p>
      ) : null}
    </article>
  );
}
function MemoriesView({
  data,
  onAdd,
}: {
  data: RoadmapData;
  onAdd: () => void;
}) {
  const sorted = [...data.memories].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  return (
    <div>
      <SectionHeading
        eyebrow="Memories"
        title="積み重ねた時間を残す"
        action={
          <Button onClick={onAdd}>
            <Plus className="size-4" />
            思い出を追加
          </Button>
        }
      />
      <p className="mb-8 max-w-2xl text-[15px] leading-7 text-muted-foreground">
        完了したものを消して終わりにせず、作品・経験・そのときの気持ちを、{data.settings.eventName}までの記録として残します。
      </p>
      {sorted.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              goal={data.goals.find((goal) => goal.id === memory.relatedGoal)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Sparkles className="mx-auto mb-4 size-7 text-muted-foreground" />
          <h2 className="font-semibold">最初の記録を残す</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            達成だけでなく、印象に残った一日でもかまいません。
          </p>
          <Button className="mt-5" onClick={onAdd}>
            思い出を追加
          </Button>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained until the post-backup rollout can remove the legacy view safely
function LegacySettingsView({
  data,
  setData,
}: {
  data: RoadmapData;
  setData: React.Dispatch<React.SetStateAction<RoadmapData>>;
}) {
  const { setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const changeTheme = (theme: ThemeMode) => {
    setData((current) => ({
      ...current,
      settings: { ...current.settings, theme },
    }));
    setTheme(theme);
  };
  const exportData = () => {
    downloadBackup(data);
    toast.success("バックアップを書き出しました");
  };
  const importData = () => {
    toast.info("安全な読み込み画面を利用してください");
  };
  return (
    <div className="max-w-3xl">
      <SectionHeading eyebrow="Settings" title="表示とデータ" />
      <div className="space-y-6">
        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            使う環境に合わせて表示を切り替えます。
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {(
              [
                { id: "light", label: "Light", icon: Sun },
                { id: "dark", label: "Dark", icon: Moon },
                { id: "system", label: "System", icon: Laptop },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => changeTheme(id)}
                aria-pressed={data.settings.theme === id}
                className={cn(
                  "flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-background text-sm transition hover:border-primary/30",
                  data.settings.theme === id &&
                    "border-primary bg-accent text-accent-foreground ring-2 ring-primary/10",
                )}
              >
                <Icon className="size-5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">Data</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            データはこの端末のブラウザに保存されます。定期的にJSONを書き出すと復元できます。
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Button
              variant="outline"
              onClick={exportData}
              className="h-12 justify-start"
            >
              <Download className="size-4" />
              JSONをExport
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="h-12 justify-start"
            >
              <Upload className="size-4" />
              JSONからImport
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={importData}
            />
          </div>
        </section>
        <section className="rounded-2xl border border-destructive/20 bg-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Reset</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            初期状態に戻すと、追加・編集した内容はこの端末から削除されます。先にExportすることをおすすめします。
          </p>
          <Button
            variant="outline"
            className="mt-5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw className="size-4" />
            初期状態に戻す
          </Button>
        </section>
      </div>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              すべてのデータを初期状態に戻しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              追加したタスク、Goal、思い出、振り返りは削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setResetOpen(false);
                toast.info("安全な削除画面を利用してください");
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              リセット
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsViewSecure({
  data,
  workspace,
  setData,
  saveStatus,
  onImport,
  onDeleteComplete,
  onShowGuide,
}: {
  data: RoadmapData;
  workspace: RoadmapWorkspace;
  setData: React.Dispatch<React.SetStateAction<RoadmapData | null>>;
  saveStatus: SaveStatus;
  onImport: () => void;
  onDeleteComplete: () => void;
  onShowGuide: () => void;
}) {
  const { setTheme } = useTheme();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [helpTopic, setHelpTopic] = useState<
    "usage" | "storage" | "backup" | "ai" | null
  >(null);
  const changeTheme = (theme: ThemeMode) => {
    setData((current) =>
      current
        ? { ...current, settings: { ...current.settings, theme } }
        : current,
    );
    setTheme(theme);
  };
  const removeData = async () => {
    try {
      await deleteAppData();
      setDeleteOpen(false);
      setDeleteConfirmed(false);
      onDeleteComplete();
      toast.success("この端末のデータを削除しました");
    } catch {
      toast.error("端末データを削除できませんでした");
    }
  };
  const statusText =
    saveStatus === "saving"
      ? "保存しています"
      : saveStatus === "error"
        ? "端末への保存に失敗しました"
        : "この端末に保存済み";
  return (
    <div className="max-w-3xl">
      <SectionHeading eyebrow="Settings" title="表示とデータ" />
      <div className="space-y-6">
        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            使う環境に合わせて表示を切り替えます。
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {(
              [
                { id: "light", label: "Light", icon: Sun },
                { id: "dark", label: "Dark", icon: Moon },
                { id: "system", label: "System", icon: Laptop },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => changeTheme(id)}
                aria-pressed={data.settings.theme === id}
                className={cn(
                  "flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-background text-sm transition hover:border-primary/30",
                  data.settings.theme === id &&
                    "border-primary bg-accent text-accent-foreground ring-2 ring-primary/10",
                )}
              >
                <Icon className="size-5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>
        <section
          id="data-privacy"
          className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
        >
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Database className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                データはこの端末だけに保存されます
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                目標、タスク、進捗、メモは、このブラウザの中に保存されます。アカウントやほかの端末には同期されません。ブラウザのデータを削除すると失われるため、定期的にバックアップを書き出してください。
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                同じ端末・同じブラウザプロフィールを使う人は、保存されたデータを閲覧できる場合があります。
              </p>
              <p
                className={cn(
                  "mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
                  saveStatus === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary",
                )}
              >
                <HardDrive className="size-3.5" />
                {statusText}
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button
              variant="outline"
              onClick={() => {
                downloadEventBackup(data);
                toast.success("バックアップを書き出しました");
              }}
              className="h-12 justify-start rounded-xl"
            >
              <Download className="size-4" />
              選択中を書き出す
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                workspace.roadmaps.forEach((roadmap, index) =>
                  window.setTimeout(() => downloadEventBackup(roadmap), index * 180),
                );
                toast.success(`${workspace.roadmaps.length}件を書き出します`);
              }}
              className="h-12 justify-start rounded-xl"
            >
              <Download className="size-4" />
              すべて（個別JSON）
            </Button>
            <Button
              variant="outline"
              onClick={onImport}
              className="h-12 justify-start rounded-xl"
            >
              <Upload className="size-4" />
              バックアップを読み込む
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            「すべて」はロードマップごとに1ファイルを書き出します。バックアップには目標やメモが読み取り可能なJSON形式で保存されるため、共有場所や保存先に注意してください。
          </p>
        </section>
        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">ヘルプ</h2>
          <div className="mt-4 divide-y divide-[var(--separator)]">
            {[
              { id: "usage", label: "使い方を見る" },
              { id: "guide", label: "初回ガイドをもう一度見る" },
              { id: "storage", label: "データの保存について" },
              { id: "backup", label: "バックアップと復元" },
              { id: "ai", label: "AIで次の一歩の使い方" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() =>
                  item.id === "guide"
                    ? onShowGuide()
                    : setHelpTopic(item.id as typeof helpTopic)
                }
                className="ios-list-row flex min-h-12 w-full items-center justify-between rounded-xl px-2 text-left text-sm font-medium"
              >
                <span>{item.label}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-destructive/20 bg-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold">この端末のデータを削除</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            このアプリが作成したIndexedDBと表示設定だけを削除します。ほかのサイトのデータには触れません。
          </p>
          <Button
            variant="outline"
            className="mt-5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            この端末のデータを削除する
          </Button>
        </section>
      </div>
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteConfirmed(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              この端末のデータを削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              この端末に保存された目標、タスク、進捗、メモをすべて削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl bg-muted/60 p-4">
            <p className="text-sm font-medium">削除前にバックアップできます</p>
            <Button
              variant="outline"
              className="mt-3 h-11"
              onClick={() => downloadEventBackup(data)}
            >
              <Download className="size-4" />
              バックアップを書き出す
            </Button>
          </div>
          <label className="flex min-h-12 items-start gap-3 rounded-xl border border-[var(--separator)] p-3 text-sm">
            <Checkbox
              checked={deleteConfirmed}
              onCheckedChange={(checked) =>
                setDeleteConfirmed(checked === true)
              }
            />
            <span>削除すると元に戻せないことを確認しました</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteConfirmed}
              onClick={() => void removeData()}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={Boolean(helpTopic)}
        onOpenChange={(open) => {
          if (!open) setHelpTopic(null);
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {helpTopic === "storage"
                ? "データの保存について"
                : helpTopic === "backup"
                  ? "バックアップと復元"
                  : helpTopic === "ai"
                    ? "AIで次の一歩"
                    : "Before Universityの使い方"}
            </DialogTitle>
            <DialogDescription>
              {helpTopic === "storage"
                ? "ロードマップはIndexedDBへ保存され、サーバーやほかの端末へ送信されません。同じブラウザプロフィールを使う人からは見える場合があります。"
                : helpTopic === "backup"
                  ? "JSONを書き出し、安全な読み込み画面で内容を確認してから、統合または置き換えを選べます。"
                  : helpTopic === "ai"
                    ? "タスク情報から相談用の文章を端末内で作ります。コピー後に外部AIへ貼り付けると、そのサービスへ情報が送られるため内容を確認してください。"
                    : "Goalで目標を置き、Taskへ小さく分け、進行中・完了を更新します。達成や体験はMemoriesへ残せます。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setHelpTopic(null)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FocusMode({
  data,
  currentMonth,
  onExit,
  onToggleTask,
  onAskAI,
}: {
  data: RoadmapData;
  currentMonth: RoadmapMonth;
  onExit: () => void;
  onToggleTask: (id: string) => void;
  onAskAI: AskAIHandler;
}) {
  const tasks = activeTasks(data.tasks).filter(
    (task) => task.month === currentMonth.id,
  );
  const visible = tasks
    .filter((task) => getTaskProgress(task) < 100)
    .slice(0, 5);
  return (
    <main className="min-h-screen bg-[var(--surface-subtle)] p-4 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-14 flex items-center justify-between">
          <AppMark />
          <Button variant="ghost" onClick={onExit} className="gap-2">
            <X className="size-4" />
            Focusを終了
          </Button>
        </div>
        <section className="ios-surface rounded-[28px] p-6 sm:p-10">
          <div className="mb-8">
            <Badge variant="outline">FOCUS MODE</Badge>
            <p className="mt-5 font-mono text-sm tracking-[0.08em] text-muted-foreground">
              {currentMonth.short} {currentMonth.year}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
              {currentMonth.theme}
            </h1>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              {currentMonth.mainFocus}
            </p>
          </div>
          <div className="mb-8">
            <div className="mb-2 flex justify-between text-sm">
              <span>今月の進捗</span>
              <strong>{taskCompletion(tasks)}%</strong>
            </div>
            <Progress value={taskCompletion(tasks)} className="h-2.5" />
          </div>
          <div className="space-y-3">
            {visible.length ? (
              visible.map((task, index) => (
                <div
                  key={task.id}
                  className="ios-press flex min-h-16 items-center gap-3 rounded-2xl border border-[var(--separator)] bg-background px-3 py-2"
                >
                  <Checkbox
                    data-guide="task-status"
                    checked={getTaskProgress(task) === 100}
                    onCheckedChange={() => onToggleTask(task.id)}
                    className="size-6 rounded-full"
                    aria-label={`${task.title}を完了にする`}
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 text-[15px]">
                    {task.title}
                  </span>
                  <AskAIButton task={task} onAskAI={onAskAI} compact />
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-muted/60 p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 size-7 text-[var(--success)]" />
                <p className="font-medium">今月のタスクは完了しています</p>
              </div>
            )}
          </div>
        </section>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Escキーでも終了できます
        </p>
      </div>
    </main>
  );
}

export default function BeforeUniversityPage() {
  const [data, setData] = useState<RoadmapData | null>(null);
  const [workspace, setWorkspace] = useState<RoadmapWorkspace | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const [page, setPage] = useState<Page>("home");
  const [focusMode, setFocusMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addMemoryOpen, setAddMemoryOpen] = useState(false);
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [taskDefaultMonth, setTaskDefaultMonth] = useState("");
  const [achievement, setAchievement] = useState<Goal | null>(null);
  const [aiTaskId, setAiTaskId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [importOpen, setImportOpen] = useState(false);
  const [importInitialTab, setImportInitialTab] = useState<
    "ai" | "file" | "paste"
  >("ai");
  const [guideOpen, setGuideOpen] = useState(false);
  const [onboardingDraft, setOnboardingDraft] =
    useState<OnboardingDraft | null>(null);
  const [migrationBlocked, setMigrationBlocked] = useState("");
  const aiReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const searchReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const initializedRef = useRef(false);
  const { setTheme } = useTheme();
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    let active = true;
    const hash = window.location.hash.replace("#", "") as Page;
    if (NAV_ITEMS.some((item) => item.id === hash))
      window.setTimeout(() => setPage(hash), 0);
    void loadInitialData()
      .then((result) => {
        if (!active) return;
        setOnboardingDraft(result.draft);
        if (result.migrationWarning) {
          setMigrationBlocked(result.migrationWarning);
          toast.error("以前のデータを移行できませんでした", {
            description: "旧データは削除せず保持しています。",
          });
        }
        if (result.data) {
          setWorkspace(result.workspace ?? createWorkspace(result.data));
          setData(result.data);
          setTheme(result.data.settings.theme);
          setSaveStatus("saved");
          if (!result.data.settings.guideCompleted) setGuideOpen(true);
        }
        if (result.source === "migrated")
          toast.success("既存データをこの端末の安全な保存領域へ移行しました");
      })
      .catch(() => {
        if (active) {
          setMigrationBlocked(
            "端末の保存領域を開けませんでした。ブラウザの設定を確認してください。",
          );
          setSaveStatus("error");
        }
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [setTheme]);
  useEffect(() => {
    if (!data) return;
    // Keep the active editable view mirrored in the atomically persisted workspace.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace((current) => {
      const base = current ?? createWorkspace(data);
      const exists = base.roadmaps.some(
        (item) => item.settings.roadmapId === data.settings.roadmapId,
      );
      return {
        ...base,
        activeRoadmapId: data.settings.roadmapId,
        roadmaps: exists
          ? base.roadmaps.map((item) =>
              item.settings.roadmapId === data.settings.roadmapId ? data : item,
            )
          : [...base.roadmaps, data],
        updatedAt: new Date().toISOString(),
      };
    });
  }, [data]);
  useEffect(() => {
    if (!hydrated || !workspace) return;
    const statusTimer = window.setTimeout(() => setSaveStatus("saving"), 0);
    const timer = window.setTimeout(() => {
      void writeWorkspace(workspace)
        .then(() => setSaveStatus("saved"))
        .catch(() => {
          setSaveStatus("error");
          toast.error("端末への保存に失敗しました", {
            description:
              "容量やプライベートブラウズ設定を確認し、バックアップを作成してください。",
          });
        });
    }, 350);
    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(timer);
    };
  }, [workspace, hydrated]);
  useEffect(() => {
    if (!hydrated || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => undefined);
  }, [hydrated]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const persistOnboardingDraft = useCallback(
    (draft: OnboardingDraft) => writeOnboardingDraft(draft),
    [],
  );
  const openImport = useCallback((tab: "ai" | "file" | "paste" = "file") => {
    setImportInitialTab(tab);
    setImportOpen(true);
  }, []);
  const completeOnboarding = useCallback(
    async (nextData: RoadmapData) => {
      await writeRoadmap(nextData);
      await clearOnboardingDraft();
      setWorkspace(createWorkspace(nextData));
      setData(nextData);
      setOnboardingDraft(null);
      setTheme(nextData.settings.theme);
      setSaveStatus("saved");
      setGuideOpen(true);
    },
    [setTheme],
  );
  const navigate = useCallback((next: Page) => {
    setPage(next);
    setSelectedMonthId(null);
    setSelectedGoalId(null);
    window.history.pushState(null, "", `#${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === "Escape" && focusMode) setFocusMode(false);
    };
    const onPopState = () => {
      const hash = window.location.hash.replace("#", "") as Page;
      if (NAV_ITEMS.some((item) => item.id === hash)) setPage(hash);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
    };
  }, [focusMode]);
  if (!hydrated)
    return (
      <main
        className="grid min-h-dvh place-items-center bg-background"
        role="status"
      >
        <div className="text-center">
          <span className="mx-auto block size-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">
            この端末のデータを確認しています
          </p>
        </div>
      </main>
    );
  if (migrationBlocked)
    return (
      <main className="grid min-h-dvh place-items-center bg-background p-4">
        <section className="ios-surface max-w-lg rounded-[28px] p-6 sm:p-8">
          <div className="grid size-12 place-items-center rounded-2xl bg-[color:color-mix(in_srgb,var(--warning)_14%,transparent)] text-[var(--warning)]">
            <HardDrive className="size-6" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.035em]">
            既存データを保護しています
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {migrationBlocked}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            現在の公開版で先にJSONバックアップを書き出し、ブラウザの保存設定を確認してから再試行してください。
          </p>
          <Button
            className="mt-6 h-11"
            onClick={() => window.location.reload()}
          >
            再試行
          </Button>
        </section>
      </main>
    );
  if (!data)
    return (
      <>
        <Onboarding
          initialDraft={onboardingDraft}
          onPersistDraft={persistOnboardingDraft}
          onComplete={completeOnboarding}
          onRequestImport={openImport}
        />
        <BackupImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          initialTab={importInitialTab}
          currentData={null}
          onImported={(imported) => {
            const next = {
              ...imported,
              settings: {
                ...imported.settings,
                onboardingCompleted: true,
                guideCompleted: false,
              },
            };
            void completeOnboarding(next);
            setImportOpen(false);
          }}
        />
        <Toaster richColors closeButton />
      </>
    );
  const readyWorkspace = workspace ?? createWorkspace(data);
  const switchRoadmap = (id: string) => {
    const next = readyWorkspace.roadmaps.find(
      (item) => item.settings.roadmapId === id,
    );
    if (!next) return;
    setWorkspace({
      ...readyWorkspace,
      activeRoadmapId: id,
      updatedAt: new Date().toISOString(),
    });
    setData(next);
    setTheme(next.settings.theme);
    setSelectedMonthId(null);
    setSelectedGoalId(null);
  };
  const createRoadmap = (next: RoadmapData) => {
    setWorkspace({
      ...readyWorkspace,
      activeRoadmapId: next.settings.roadmapId,
      roadmaps: [...readyWorkspace.roadmaps, next],
      updatedAt: new Date().toISOString(),
    });
    setData(next);
    setPage("home");
    window.history.replaceState(null, "", "#home");
  };
  const updateRoadmap = (next: RoadmapData) => setData(next);
  const deleteRoadmap = (id: string) => {
    const remaining = readyWorkspace.roadmaps.filter(
      (item) => item.settings.roadmapId !== id,
    );
    if (!remaining.length) return;
    const next = remaining[0];
    setWorkspace({
      ...readyWorkspace,
      activeRoadmapId: next.settings.roadmapId,
      roadmaps: remaining,
      updatedAt: new Date().toISOString(),
    });
    setData(next);
    setTheme(next.settings.theme);
  };
  const currentMonthId = getCurrentMonthId(now, data.months);
  const currentMonth =
    data.months.find((month) => month.id === currentMonthId) ?? data.months[0];
  const setReadyData = setData as React.Dispatch<
    React.SetStateAction<RoadmapData>
  >;
  const openAIForTask: AskAIHandler = (task, trigger) => {
    aiReturnFocusRef.current = trigger ?? null;
    setSearchOpen(false);
    setAiTaskId(task.id);
  };
  const handleAIOpenChange = (open: boolean) => {
    if (!open) setAiTaskId(null);
  };
  const toggleTask = (id: string) =>
    setReadyData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== id) return task;
        const completing = getTaskProgress(task) < 100;
        return {
          ...task,
          completed: completing,
          completedAt: completing ? toDateKey(new Date()) : null,
          progress: completing ? 100 : 0,
          status: completing ? "completed" : "not_started",
          subtasks: task.subtasks?.map((subtask) => ({
            ...subtask,
            completed: completing,
          })),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  const editTask = (id: string, title: string) =>
    setReadyData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id
          ? { ...task, title, updatedAt: new Date().toISOString() }
          : task,
      ),
    }));
  const markTaskInProgress = (id: string) => {
    setReadyData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id && getTaskProgress(task) < 100
          ? {
              ...task,
              status: "in_progress",
              updatedAt: new Date().toISOString(),
            }
          : task,
      ),
    }));
    toast.success("タスクを進行中にしました");
  };
  const deleteTask = (id: string) => {
    const deleted = data.tasks.find((task) => task.id === id);
    const index = data.tasks.findIndex((task) => task.id === id);
    if (!deleted) return;
    setReadyData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id),
    }));
    toast("タスクを削除しました", {
      action: {
        label: "元に戻す",
        onClick: () =>
          setReadyData((current) => {
            if (current.tasks.some((task) => task.id === deleted.id))
              return current;
            const tasks = [...current.tasks];
            tasks.splice(Math.max(0, index), 0, deleted);
            return { ...current, tasks };
          }),
      },
    });
  };
  const addTask = (task: Task) =>
    setReadyData((current) => ({
      ...current,
      tasks: [...current.tasks, task],
    }));
  const openAddTask = (month = currentMonthId) => {
    setTaskDefaultMonth(month);
    setAddTaskOpen(true);
  };
  const addGoal = (goal: Goal) =>
    setReadyData((current) => ({
      ...current,
      goals: [...current.goals, goal],
    }));
  const addMemory = (memory: Memory) =>
    setReadyData((current) => ({
      ...current,
      memories: [...current.memories, memory],
    }));
  const updateMonth = (month: RoadmapMonth) =>
    setReadyData((current) => ({
      ...current,
      months: current.months.map((item) =>
        item.id === month.id ? month : item,
      ),
    }));
  const updateGoal = (goal: Goal) =>
    setReadyData((current) => ({
      ...current,
      goals: current.goals.map((item) => (item.id === goal.id ? goal : item)),
    }));
  const toggleGoal = (id: string) => {
    const goal = data.goals.find((item) => item.id === id);
    if (!goal) return;
    const completing = !goal.completedAt;
    const date = toDateKey(new Date());
    setReadyData((current) => ({
      ...current,
      goals: current.goals.map((item) =>
        item.id === id
          ? {
              ...item,
              completedAt: completing ? date : null,
              progress: completing ? 100 : item.progress,
            }
          : item,
      ),
      memories: completing
        ? [
            ...current.memories,
            {
              id: makeId("achievement"),
              title: `${goal.title} Completed`,
              description: `「${goal.titleJa}」を達成した。`,
              date,
              relatedGoal: goal.id,
              relatedTask: null,
              imageUrl: null,
            },
          ]
        : current.memories.filter(
            (memory) =>
              !(
                memory.relatedGoal === id &&
                memory.title === `${goal.title} Completed`
              ),
          ),
    }));
    if (completing) {
      setAchievement(goal);
      window.setTimeout(() => setAchievement(null), 1900);
    }
  };
  const openSearchResult = (kind: "task" | "goal" | "month", id: string) => {
    if (kind === "task") {
      const task = data.tasks.find((item) => item.id === id);
      if (task) {
        navigate("roadmap");
        setSelectedMonthId(task.month);
      }
    }
    if (kind === "goal") {
      navigate("goals");
      setSelectedGoalId(id);
    }
    if (kind === "month") {
      navigate("roadmap");
      setSelectedMonthId(id);
    }
    setSearchOpen(false);
  };
  const aiTask = aiTaskId
    ? (data.tasks.find((task) => task.id === aiTaskId) ?? null)
    : null;
  if (focusMode)
    return (
      <>
        <FocusMode
          data={data}
          currentMonth={currentMonth}
          onExit={() => setFocusMode(false)}
          onToggleTask={toggleTask}
          onAskAI={openAIForTask}
        />
        <NextStepPromptSheet
          key={aiTask?.id ?? "no-ai-task"}
          task={aiTask}
          data={data}
          open={Boolean(aiTask)}
          onOpenChange={handleAIOpenChange}
          onMarkInProgress={markTaskInProgress}
          returnFocusRef={aiReturnFocusRef}
        />
        <Toaster richColors />
      </>
    );
  return (
    <SidebarProvider defaultOpen data-roadmap-theme={data.settings.themeColor}>
      <Sidebar
        collapsible="icon"
        className="border-r border-sidebar-border bg-sidebar"
      >
        <SidebarHeader className="p-4 group-data-[collapsible=icon]:px-2">
          <AppMark />
        </SidebarHeader>
        <SidebarContent className="px-2 pt-5">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton
                      isActive={page === id}
                      tooltip={label}
                      onClick={() => navigate(id)}
                      className="h-11 rounded-xl px-3"
                    >
                      <Icon className="size-[18px]" />
                      <span className="tablet-nav-label">{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <button
            onClick={() => setFocusMode(true)}
            className="flex min-h-14 w-full items-center gap-3 overflow-hidden rounded-xl border border-sidebar-border bg-background/70 px-3 text-left transition hover:bg-background group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:min-h-10 group-data-[collapsible=icon]:p-2.5"
            title="Focus Mode"
          >
            <Focus className="size-[18px] shrink-0 text-primary" />
            <span className="tablet-focus-text min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block text-sm font-medium">Focus Mode</span>
              <span className="block truncate text-xs text-muted-foreground">
                今月だけに集中
              </span>
            </span>
          </button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="app-toolbar sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-[var(--separator)] bg-background/82 px-4 backdrop-blur-2xl sm:gap-3 sm:px-6 lg:px-8">
          <SidebarTrigger className="hidden md:inline-flex" />
          <div className="min-w-0 flex-1">
            <RoadmapSwitcher
              workspace={readyWorkspace}
              current={data}
              onSwitch={switchRoadmap}
              onCreate={createRoadmap}
              onUpdate={updateRoadmap}
              onDelete={deleteRoadmap}
              onImport={() => openImport("file")}
            />
          </div>
          <button
            type="button"
            onClick={() => navigate("settings")}
            className={cn(
              "ios-press inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium",
              saveStatus === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/[0.08] text-primary",
            )}
            aria-label={`${saveStatus === "saving" ? "保存しています" : saveStatus === "error" ? "端末への保存に失敗しました" : "ローカル保存済み"}。データ保存の説明を開く`}
          >
            <HardDrive className="size-4" />
            <span className="hidden sm:inline">
              {saveStatus === "saving"
                ? "保存中"
                : saveStatus === "error"
                  ? "保存失敗"
                  : "ローカル保存"}
            </span>
          </button>
          <Button
            ref={searchReturnFocusRef}
            variant="outline"
            onClick={() => setSearchOpen(true)}
            className="h-10 rounded-xl border-[var(--separator)] bg-card/75 text-muted-foreground shadow-none sm:min-w-40 sm:justify-between"
            aria-label="検索を開く"
          >
            <span className="flex items-center gap-2">
              <Search className="size-4" />
              <span className="hidden sm:inline">検索</span>
            </span>
            <span className="hidden rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
              ⌘ K
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 rounded-xl"
            onClick={() => setFocusMode(true)}
            aria-label="Focus Modeを開く"
          >
            <Focus className="size-[18px]" />
          </Button>
        </header>
        <div className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-14">
          <div key={page} className="page-enter">
            {page === "home" ? (
              <DashboardV2
                data={data}
                now={now}
                currentMonth={currentMonth}
                onNavigate={navigate}
                onOpenMonth={(id) => {
                  navigate("roadmap");
                  setSelectedMonthId(id);
                }}
                onToggleTask={toggleTask}
                onAddTask={() => openAddTask()}
                onAskAI={openAIForTask}
              />
            ) : null}
            {page === "roadmap" ? (
              <RoadmapView
                data={data}
                now={now}
                selectedMonthId={selectedMonthId}
                setSelectedMonthId={setSelectedMonthId}
                onToggleTask={toggleTask}
                onEditTask={editTask}
                onDeleteTask={deleteTask}
                onAddTask={openAddTask}
                updateMonth={updateMonth}
                onAskAI={openAIForTask}
              />
            ) : null}
            {page === "goals" ? (
              <GoalsView
                data={data}
                selectedGoalId={selectedGoalId}
                setSelectedGoalId={setSelectedGoalId}
                onToggleTask={toggleTask}
                onEditTask={editTask}
                onDeleteTask={deleteTask}
                onToggleGoal={toggleGoal}
                onAddGoal={() => setAddGoalOpen(true)}
                onUpdateGoal={updateGoal}
                onAskAI={openAIForTask}
              />
            ) : null}
            {page === "memories" ? (
              <MemoriesView data={data} onAdd={() => setAddMemoryOpen(true)} />
            ) : null}
            {page === "settings" ? (
              <SettingsViewSecure
                data={data}
                workspace={readyWorkspace}
                setData={setData}
                saveStatus={saveStatus}
                onImport={() => openImport("file")}
                onDeleteComplete={() => {
                  setData(null);
                  setWorkspace(null);
                  setOnboardingDraft(null);
                  setSaveStatus("loading");
                  setPage("home");
                  window.history.replaceState(null, "", "#home");
                }}
                onShowGuide={() => {
                  navigate("home");
                  window.setTimeout(() => setGuideOpen(true), 250);
                }}
              />
            ) : null}
          </div>
        </div>
      </SidebarInset>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--separator)] bg-[var(--surface-glass)] px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-2xl md:hidden"
        aria-label="メインナビゲーション"
      >
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              aria-current={page === id ? "page" : undefined}
              className={cn(
                "ios-press flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium text-muted-foreground",
                page === id && "text-primary",
              )}
            >
              <span
                className={cn(
                  "grid h-7 min-w-11 place-items-center rounded-full transition-colors duration-200",
                  page === id && "bg-primary/10",
                )}
              >
                <Icon
                  className="size-[20px]"
                  strokeWidth={page === id ? 2.4 : 1.9}
                />
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
      <AddTaskDialog
        key={`${taskDefaultMonth}-${addTaskOpen ? "open" : "closed"}`}
        open={addTaskOpen}
        onOpenChange={setAddTaskOpen}
        data={data}
        defaultMonth={taskDefaultMonth}
        onAdd={addTask}
      />
      <AddGoalDialog
        open={addGoalOpen}
        onOpenChange={setAddGoalOpen}
        onAdd={addGoal}
      />
      <AddMemoryDialog
        open={addMemoryOpen}
        onOpenChange={setAddMemoryOpen}
        data={data}
        onAdd={addMemory}
      />
      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        returnFocusRef={searchReturnFocusRef}
        title="ロードマップを検索"
        description="タスク、Goal、月を検索します"
      >
        <CommandInput placeholder="タスク、Goal、月を検索…" />
        <CommandList>
          <CommandEmpty>見つかりませんでした</CommandEmpty>
          <CommandGroup heading="Tasks">
            {activeTasks(data.tasks).map((task) => (
              <CommandItem
                key={task.id}
                value={`${task.title} ${CATEGORY_META[task.category].label}`}
                onSelect={() => openSearchResult("task", task.id)}
              >
                <CheckCircle2
                  className={cn(
                    "size-4",
                    getTaskProgress(task) === 100
                      ? "text-[var(--success)]"
                      : "text-muted-foreground",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                <CommandShortcut>{task.month}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="AIで次の一歩">
            {activeTasks(data.tasks).map((task) => (
              <CommandItem
                key={`ai-${task.id}`}
                value={`${task.title} ${CATEGORY_META[task.category].label} AIで次の一歩`}
                onSelect={() => openAIForTask(task)}
                aria-label={`${task.title}についてAIに次の一歩を聞く`}
                className="text-primary"
              >
                <Sparkles className="size-4" />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                <CommandShortcut>AIで次の一歩</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Goals">
            {data.goals.map((goal) => (
              <CommandItem
                key={goal.id}
                value={`${goal.title} ${goal.titleJa}`}
                onSelect={() => openSearchResult("goal", goal.id)}
              >
                <Target className="size-4" />
                <span className="min-w-0 flex-1 truncate">{goal.title}</span>
                <CommandShortcut>
                  {getGoalProgress(goal, data.tasks)}%
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Months">
            {data.months.map((month) => (
              <CommandItem
                key={month.id}
                value={`${month.label} ${month.theme} ${month.id}`}
                onSelect={() => openSearchResult("month", month.id)}
              >
                <CalendarDays className="size-4" />
                <span className="min-w-0 flex-1 truncate">
                  {month.year}年{month.month}月 — {month.theme}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <NextStepPromptSheet
        key={aiTask?.id ?? "no-ai-task"}
        task={aiTask}
        data={data}
        open={Boolean(aiTask)}
        onOpenChange={handleAIOpenChange}
        onMarkInProgress={markTaskInProgress}
        returnFocusRef={aiReturnFocusRef}
      />
      <BackupImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        initialTab={importInitialTab}
        currentData={data}
        onImported={(imported) => {
          setData(imported);
          setTheme(imported.settings.theme);
          setSaveStatus("saved");
          toast.success("バックアップを読み込みました");
        }}
      />
      <FirstUseGuide
        open={guideOpen && page === "home"}
        onOpenChange={setGuideOpen}
        onComplete={() =>
          setReadyData((current) => ({
            ...current,
            settings: { ...current.settings, guideCompleted: true },
          }))
        }
      />
      {achievement ? (
        <div
          className="achievement-pop fixed left-1/2 top-1/2 z-[70] w-[min(420px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-primary/20 bg-card p-7 text-center shadow-[0_28px_100px_-24px_color-mix(in_srgb,var(--primary)_48%,transparent)]"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Trophy className="size-6" />
          </div>
          <p className="mt-5 text-xs font-medium uppercase tracking-[0.14em] text-primary">
            Goal Completed
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
            {achievement.title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            この達成をMemoriesに残しました
          </p>
        </div>
      ) : null}
      <Toaster richColors closeButton />
    </SidebarProvider>
  );
}
