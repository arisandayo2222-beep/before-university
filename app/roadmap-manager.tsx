"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, FileDown, FileUp, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { downloadEventBackup } from "./event-backup";
import type { RoadmapWorkspace } from "./local-data";
import { createEmptyData, createRoadmapMonths, type RoadmapData } from "./roadmap-data";

const today = () => new Date().toISOString().slice(0, 10);
const remainingDays = (date: string) =>
  Math.max(0, Math.ceil((new Date(`${date}T00:00:00`).getTime() - Date.now()) / 86_400_000));

type EditorState = {
  roadmapName: string;
  eventName: string;
  eventDescription: string;
  startDate: string;
  targetDate: string;
  weeklyCapacityMinutes: string;
};

const blankEditor = (): EditorState => ({
  roadmapName: "",
  eventName: "",
  eventDescription: "",
  startDate: today(),
  targetDate: "",
  weeklyCapacityMinutes: "",
});

export function RoadmapSwitcher({
  workspace,
  current,
  onSwitch,
  onCreate,
  onUpdate,
  onDelete,
  onImport,
}: {
  workspace: RoadmapWorkspace;
  current: RoadmapData;
  onSwitch: (id: string) => void;
  onCreate: (data: RoadmapData) => void;
  onUpdate: (data: RoadmapData) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editor, setEditor] = useState<EditorState>(blankEditor);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RoadmapData | null>(null);
  const [backedUp, setBackedUp] = useState(false);

  const startCreate = (university = false) => {
    setEditor({
      roadmapName: university ? "大学入学まで" : "",
      eventName: university ? "大学入学" : "",
      eventDescription: "",
      startDate: today(),
      targetDate: university ? "2027-04-01" : "",
      weeklyCapacityMinutes: "",
    });
    setError("");
    setView("create");
  };
  const startEdit = () => {
    setEditor({
      roadmapName: current.settings.roadmapName,
      eventName: current.settings.eventName,
      eventDescription: current.settings.eventDescription,
      startDate: current.settings.startDate,
      targetDate: current.settings.targetDate,
      weeklyCapacityMinutes: current.settings.weeklyCapacityMinutes?.toString() ?? "",
    });
    setError("");
    setView("edit");
  };
  const save = () => {
    if (!editor.eventName.trim() || !editor.startDate || !editor.targetDate) {
      setError("イベント名、開始日、イベント日は必須です");
      return;
    }
    if (editor.targetDate <= editor.startDate) {
      setError("イベント日は開始日より後にしてください");
      return;
    }
    const capacity = editor.weeklyCapacityMinutes.trim() ? Number(editor.weeklyCapacityMinutes) : null;
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0 || capacity > 10_080)) {
      setError("1週間に使える時間は0〜10080分で入力してください");
      return;
    }
    if (view === "create") {
      onCreate(createEmptyData({
        roadmapName: editor.roadmapName || `${editor.eventName}まで`,
        eventName: editor.eventName,
        eventDescription: editor.eventDescription,
        finalGoal: editor.eventDescription || `${editor.eventName}までに、やりたいことを実現する`,
        startDate: editor.startDate,
        targetDate: editor.targetDate,
        weeklyCapacityMinutes: capacity,
        onboardingCompleted: true,
        guideCompleted: true,
      }));
    } else {
      const affected = current.tasks.filter((task) => task.dueDate && task.dueDate > editor.targetDate).length;
      if (affected && !window.confirm(`新しいイベント日より後に${affected}件のタスクがあります。警告付きで日付を変更しますか？`)) return;
      onUpdate({
        ...current,
        months: createRoadmapMonths(editor.startDate, editor.targetDate).map((month) => current.months.find((old) => old.id === month.id) ?? month),
        settings: {
          ...current.settings,
          roadmapName: editor.roadmapName || `${editor.eventName}まで`,
          eventName: editor.eventName,
          eventDescription: editor.eventDescription,
          startDate: editor.startDate,
          targetDate: editor.targetDate,
          finalGoal: editor.eventDescription || `${editor.eventName}までに、やりたいことを実現する`,
          weeklyCapacityMinutes: capacity,
        },
      });
    }
    setView("list");
  };

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} className="h-11 min-w-0 max-w-[min(420px,55vw)] justify-start rounded-xl px-2.5" aria-label="ロードマップを切り替える">
        <CalendarDays className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 text-left"><span className="block truncate text-xs font-semibold">{current.settings.roadmapName}</span><span className="block truncate text-[10px] text-muted-foreground">{current.settings.eventName} · あと{remainingDays(current.settings.targetDate)}日</span></span>
        <ChevronDown className="ml-auto size-4 shrink-0" />
      </Button>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setView("list"); }}>
        <DialogContent className="sm:max-w-[640px]" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle>{view === "list" ? "ロードマップ" : view === "create" ? "新しいロードマップ" : "イベント設定を編集"}</DialogTitle><DialogDescription>{view === "list" ? "この端末に保存されたロードマップを切り替えます。" : "名前や学校名などの個人情報は不要です。"}</DialogDescription></DialogHeader>
          {view === "list" ? <div className="space-y-3">
            {workspace.roadmaps.map((item) => <button key={item.settings.roadmapId} type="button" onClick={() => { onSwitch(item.settings.roadmapId); setOpen(false); }} className={cn("ios-press flex min-h-16 w-full items-center gap-3 rounded-2xl border p-4 text-left", item.settings.roadmapId === current.settings.roadmapId && "border-primary bg-primary/[0.05]")}><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.settings.roadmapName}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.settings.eventName} · {item.settings.targetDate}</span></span>{item.settings.roadmapId === current.settings.roadmapId ? <span className="text-xs font-medium text-primary">選択中</span> : null}</button>)}
            <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" className="h-11" onClick={() => startCreate(false)}><Plus className="size-4" />自由に新規作成</Button><Button variant="outline" className="h-11" onClick={() => startCreate(true)}><CalendarDays className="size-4" />大学入学テンプレート</Button><Button variant="ghost" className="h-11" onClick={() => { setOpen(false); onImport(); }}><FileUp className="size-4" />ファイルから追加</Button><Button variant="ghost" className="h-11" onClick={startEdit}><Pencil className="size-4" />選択中を編集</Button></div>
            <Button variant="ghost" className="h-11 w-full text-destructive hover:text-destructive" disabled={workspace.roadmaps.length <= 1} onClick={() => { setDeleteTarget(current); setBackedUp(false); }}><Trash2 className="size-4" />選択中を削除</Button>
          </div> : <Editor editor={editor} setEditor={setEditor} error={error} />}
          <DialogFooter>{view === "list" ? <Button variant="ghost" onClick={() => setOpen(false)}>閉じる</Button> : <><Button variant="ghost" onClick={() => setView("list")}>戻る</Button><Button onClick={save}>{view === "create" ? "ロードマップを作成" : "変更を保存"}</Button></>}</DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>このロードマップを削除しますか？</AlertDialogTitle><AlertDialogDescription>「{deleteTarget?.settings.roadmapName}」の目標、タスク、進捗、メモをこの端末から削除します。元に戻せません。</AlertDialogDescription></AlertDialogHeader><Button variant="outline" onClick={() => { if (deleteTarget) downloadEventBackup(deleteTarget); setBackedUp(true); }}><FileDown className="size-4" />{backedUp ? "バックアップ作成済み" : "先にバックアップを書き出す"}</Button><AlertDialogFooter><AlertDialogCancel>キャンセル</AlertDialogCancel><AlertDialogAction disabled={!backedUp} className="bg-destructive text-destructive-foreground" onClick={() => { if (deleteTarget) onDelete(deleteTarget.settings.roadmapId); setDeleteTarget(null); setOpen(false); }}>削除する</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Editor({ editor, setEditor, error }: { editor: EditorState; setEditor: React.Dispatch<React.SetStateAction<EditorState>>; error: string }) {
  const field = (key: keyof EditorState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditor((current) => ({ ...current, [key]: event.target.value }));
  return <div className="space-y-4"><div className="space-y-2"><Label htmlFor="event-name">イベント名 *</Label><Input id="event-name" value={editor.eventName} onChange={field("eventName")} maxLength={200} placeholder="例：文化祭、資格試験、作品公開" /></div><div className="space-y-2"><Label htmlFor="roadmap-name">ロードマップ名（任意）</Label><Input id="roadmap-name" value={editor.roadmapName} onChange={field("roadmapName")} maxLength={200} placeholder="例：文化祭まで" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="start-date">開始日 *</Label><Input id="start-date" type="date" value={editor.startDate} onChange={field("startDate")} /></div><div className="space-y-2"><Label htmlFor="event-date">イベント日 *</Label><Input id="event-date" type="date" min={editor.startDate} value={editor.targetDate} onChange={field("targetDate")} /></div></div><div className="space-y-2"><Label htmlFor="event-description">実現したい状態（任意）</Label><Textarea id="event-description" value={editor.eventDescription} onChange={field("eventDescription")} maxLength={2000} /></div><div className="space-y-2"><Label htmlFor="weekly-capacity">1週間に使える時間（分・任意）</Label><Input id="weekly-capacity" type="number" min={0} max={10080} value={editor.weeklyCapacityMinutes} onChange={field("weeklyCapacityMinutes")} /></div>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</div>;
}
