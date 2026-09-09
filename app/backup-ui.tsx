"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clipboard,
  FileJson,
  FileUp,
  Merge,
  Replace,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildRoadmapAIPrompt,
  downloadEventBackup,
  parseEventBackupText,
  type ParsedEventBackup,
} from "./event-backup";
import {
  MAX_BACKUP_BYTES,
  mergeRoadmaps,
  writeRoadmap,
  type ImportMode,
} from "./local-data";
import { copyTextWithFallback } from "./next-step-prompt";
import type { RoadmapData } from "./roadmap-data";

type ImportStep = "choose" | "preview" | "confirm" | "saving";

export function BackupImportDialog({
  open,
  onOpenChange,
  currentData,
  onImported,
  initialTab = "ai",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentData: RoadmapData | null;
  onImported: (data: RoadmapData, mode: ImportMode) => void;
  initialTab?: "ai" | "file" | "paste";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [step, setStep] = useState<ImportStep>("choose");
  const [parsed, setParsed] = useState<ParsedEventBackup | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [mode, setMode] = useState<ImportMode>("new");
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState("");
  const [backupCreated, setBackupCreated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<"ai" | "file" | "paste">(initialTab);
  const aiPrompt = buildRoadmapAIPrompt();
  const hasRecords = Boolean(
    currentData &&
      (currentData.goals.length || currentData.tasks.length || currentData.memories.length),
  );
  const destructive = hasRecords && mode === "replace";

  useEffect(() => {
    if (!open || step !== "choose") return;
    const timer = window.setTimeout(() => setTab(initialTab), 0);
    return () => window.clearTimeout(timer);
  }, [initialTab, open, step]);

  const reset = () => {
    setStep("choose");
    setParsed(null);
    setSourceName("");
    setMode("new");
    setPasted("");
    setError("");
    setBackupCreated(false);
    setDragging(false);
    if (inputRef.current) inputRef.current.value = "";
  };
  const changeOpen = (next: boolean) => {
    if (!next && step === "saving") return;
    onOpenChange(next);
    if (!next) window.setTimeout(reset, 200);
  };
  const parse = (text: string, name: string) => {
    setError("");
    try {
      setParsed(parseEventBackupText(text));
      setSourceName(name);
      setMode("new");
      setStep("preview");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "JSONを確認できませんでした");
    }
  };
  const selectFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError(".json形式のファイルを選んでください");
      return;
    }
    if (file.size > MAX_BACKUP_BYTES) {
      setError("ファイルサイズは2MB以下にしてください");
      return;
    }
    parse(await file.text(), file.name);
  };
  const copyPrompt = async () => {
    const field = promptRef.current;
    if (!field) return;
    const result = await copyTextWithFallback(aiPrompt, {
      writeText: navigator.clipboard?.writeText
        ? (value) => navigator.clipboard.writeText(value)
        : undefined,
      selectText: () => {
        field.focus();
        field.select();
      },
      legacyCopy: () => document.execCommand?.("copy") ?? false,
    });
    toast[result === "selected" ? "info" : "success"](
      result === "selected"
        ? "プロンプトを選択しました。端末のコピー操作を使ってください"
        : "AI用プロンプトをコピーしました",
    );
  };
  const runImport = async () => {
    if (!parsed || (destructive && !backupCreated)) return;
    setStep("saving");
    setError("");
    try {
      let next = structuredClone(parsed.data);
      if (mode === "merge" && currentData) next = mergeRoadmaps(currentData, next);
      if (mode === "replace" && currentData) {
        next.settings.roadmapId = currentData.settings.roadmapId;
        next.settings.theme = currentData.settings.theme;
      }
      await writeRoadmap(next);
      onImported(next, mode);
      onOpenChange(false);
      window.setTimeout(reset, 200);
    } catch {
      setStep("confirm");
      setError("読み込みに失敗しました。現在のデータは変更されていません。");
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-[720px]" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>ロードマップを読み込む</DialogTitle>
          <DialogDescription>
            JSONは端末内だけで検証され、サーバーへ送信されません。
          </DialogDescription>
        </DialogHeader>

        {step === "choose" ? (
          <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="min-w-0">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl p-1">
              <TabsTrigger value="ai" className="min-h-11 text-xs sm:text-sm">AIと作る</TabsTrigger>
              <TabsTrigger value="file" className="min-h-11 text-xs sm:text-sm">ファイル</TabsTrigger>
              <TabsTrigger value="paste" className="min-h-11 text-xs sm:text-sm">JSON貼付</TabsTrigger>
            </TabsList>
            <TabsContent value="ai" className="space-y-4 pt-3">
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.05] p-4">
                <div className="flex gap-3">
                  <Bot className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="font-semibold">AIと一緒にロードマップを作る</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      1問ずつ整理し、最後にこのサイトへ読み込めるSchema v2のJSONを作ってもらいます。
                    </p>
                  </div>
                </div>
              </div>
              <Label htmlFor="roadmap-ai-prompt">AIへ渡す専用プロンプト</Label>
              <Textarea ref={promptRef} id="roadmap-ai-prompt" readOnly value={aiPrompt} className="min-h-48 resize-y rounded-2xl text-xs leading-5" />
              <p className="text-xs leading-5 text-muted-foreground">
                このプロンプトを外部AIへ貼り付けた後の会話内容は、そのAIサービスへ送信されます。名前、学校名、住所など、不要な個人情報は入力しないでください。
              </p>
              <Button className="h-11 w-full rounded-xl" onClick={() => void copyPrompt()}>
                <Clipboard className="size-4" />プロンプトをコピー
              </Button>
            </TabsContent>
            <TabsContent value="file" className="pt-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); void selectFile(event.dataTransfer.files[0]); }}
                className={cn("ios-press flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center", dragging ? "border-primary bg-primary/10" : "border-primary/35 bg-primary/[0.04]")}
              >
                <FileUp className="size-7 text-primary" />
                <span className="mt-4 font-semibold">JSONファイルを選択</span>
                <span className="mt-1 text-sm text-muted-foreground">またはここへドロップ・最大2MB</span>
              </button>
              <input ref={inputRef} type="file" accept=".json,application/json" className="sr-only" onChange={(event) => void selectFile(event.target.files?.[0])} />
            </TabsContent>
            <TabsContent value="paste" className="space-y-3 pt-3">
              <Label htmlFor="pasted-roadmap-json">JSONコード</Label>
              <Textarea ref={pasteRef} id="pasted-roadmap-json" value={pasted} onChange={(event) => setPasted(event.target.value.slice(0, MAX_BACKUP_BYTES))} placeholder="{ &quot;format&quot;: &quot;before-roadmap&quot;, ... }" className="min-h-56 resize-y rounded-2xl font-mono text-xs" />
              <p className="text-xs text-muted-foreground">外側の```jsonコードブロックは自動で取り除きます。</p>
              <Button className="h-11 w-full rounded-xl" disabled={!pasted.trim()} onClick={() => parse(pasted, "貼り付けたJSON")}>検証してプレビュー</Button>
            </TabsContent>
          </Tabs>
        ) : null}

        {step === "preview" && parsed ? (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-[var(--surface-subtle)] p-5">
              <p className="truncate text-xs text-muted-foreground">{sourceName}</p>
              <h3 className="mt-1 text-lg font-semibold">{parsed.data.settings.roadmapName}</h3>
              <p className="mt-1 text-sm">{parsed.data.settings.eventName} · {parsed.data.settings.targetDate}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <PreviewCount label="目標" value={parsed.data.goals.length} />
                <PreviewCount label="タスク" value={parsed.data.tasks.length} />
                <PreviewCount label="カテゴリ" value={parsed.data.categories.length} />
              </div>
              <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                <p>週の目安：{parsed.data.settings.weeklyCapacityMinutes == null ? "未設定" : `${parsed.data.settings.weeklyCapacityMinutes}分`}</p>
                <p>タスク期限：{parsed.earliestTaskDate ?? "未設定"} 〜 {parsed.latestTaskDate ?? "未設定"}</p>
              </div>
            </div>
            {parsed.warnings.length ? (
              <div role="alert" className="rounded-xl bg-[color:color-mix(in_srgb,var(--warning)_10%,transparent)] p-4 text-sm">
                <p className="font-semibold">確認が必要です</p>
                {parsed.warnings.map((warning) => <p key={warning} className="mt-1">{warning}</p>)}
              </div>
            ) : null}
            <Label>読み込み方法</Label>
            <RadioGroup value={mode} onValueChange={(value) => { setMode(value as ImportMode); setBackupCreated(false); }} className="space-y-2">
              <ImportChoice value="new" icon={CheckCircle2} title="新しいロードマップとして追加" description="既存データへ触れず、別のロードマップとして保存します" />
              {currentData ? <>
                <ImportChoice value="merge" icon={Merge} title="現在のロードマップと統合" description="IDを安全に変換して現在の項目へ追加します" />
                <ImportChoice value="replace" icon={Replace} title="現在のロードマップを置き換える" description="現在の1件だけをこの内容へ置き換えます" />
              </> : null}
            </RadioGroup>
          </div>
        ) : null}

        {step === "confirm" && parsed ? (
          <div className="space-y-4">
            <div className={cn("rounded-2xl border p-5", destructive ? "border-[var(--warning)]/30 bg-[var(--warning)]/5" : "border-primary/20 bg-primary/[0.05]")}>
              <div className="flex gap-3">{destructive ? <AlertTriangle className="size-5 shrink-0 text-[var(--warning)]" /> : <ShieldCheck className="size-5 shrink-0 text-primary" />}<div><h3 className="font-semibold">{mode === "new" ? "新しいロードマップを追加します" : mode === "merge" ? "現在の内容へ統合します" : "現在の1件を置き換えます"}</h3><p className="mt-1 text-sm text-muted-foreground">保存が成功するまで、現在のデータは変更されません。</p></div></div>
            </div>
            {destructive && currentData ? <div className="rounded-2xl border p-4"><p className="text-sm font-medium">置き換える前にバックアップしてください</p><Button variant="outline" className="mt-3 h-11" onClick={() => { downloadEventBackup(currentData); setBackupCreated(true); }}><FileJson className="size-4" />{backupCreated ? "バックアップ作成済み" : "現在のロードマップを書き出す"}</Button></div> : null}
          </div>
        ) : null}
        {step === "saving" ? <div role="status" className="rounded-2xl bg-muted/60 p-8 text-center"><span className="mx-auto block size-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" /><p className="mt-4 font-medium">この端末へ保存しています</p></div> : null}
        {error ? <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          {step === "choose" ? <Button variant="ghost" onClick={() => changeOpen(false)}>閉じる</Button> : null}
          {step === "preview" ? <><Button variant="ghost" onClick={reset}>戻る</Button><Button onClick={() => setStep("confirm")}>読み込み内容を確認</Button></> : null}
          {step === "confirm" ? <><Button variant="ghost" onClick={() => setStep("preview")}>戻る</Button><Button onClick={() => void runImport()} disabled={destructive && !backupCreated}>{mode === "new" ? "追加する" : mode === "merge" ? "統合する" : "置き換える"}</Button></> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewCount({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-card px-2 py-3"><strong className="text-xl tabular-nums">{value}</strong><p className="mt-0.5 text-xs text-muted-foreground">{label}</p></div>;
}

function ImportChoice({ value, icon: Icon, title, description }: { value: ImportMode; icon: typeof Merge; title: string; description: string }) {
  return <label className="ios-press flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/[0.05]"><RadioGroupItem value={value} className="mt-0.5" /><Icon className="mt-0.5 size-4 shrink-0 text-primary" /><span><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span></span></label>;
}
