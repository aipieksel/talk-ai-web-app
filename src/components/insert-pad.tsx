import { ArrowDownToLine, Copy, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { PromptSelect } from "@/components/prompt-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { runCleanup } from "@/lib/cleanup-client";
import { uid, cn } from "@/lib/utils";
import { useApp } from "@/stores/app";

export function InsertPad({ compact = false }: { compact?: boolean }) {
  const pad = useApp((s) => s.pad);
  const padResult = useApp((s) => s.padResult);
  const setPad = useApp((s) => s.setPad);
  const setPadResult = useApp((s) => s.setPadResult);
  const lastPadPromptId = useApp((s) => s.lastPadPromptId);
  const setLastPadPrompt = useApp((s) => s.setLastPadPrompt);
  const promptById = useApp((s) => s.promptById);
  const addHistory = useApp((s) => s.addHistory);
  const settings = useApp((s) => s.settings);
  const [dragging, setDragging] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const copy = async (text: string, label: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Could not copy");
    }
  };

  const ingest = useCallback(
    (text: string) => {
      const next = text.trim();
      if (!next) return;
      setPad(next);
      toast.success("Dropped into pad");
    },
    [setPad],
  );

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.size > 1_500_000) {
        toast.error("That file is too large");
        return;
      }
      const text = await file.text();
      ingest(text);
      return;
    }
    const plain = e.dataTransfer.getData("text/plain");
    if (plain) ingest(plain);
  };

  const clean = async () => {
    const raw = pad.trim();
    if (!raw) {
      toast.error("Drop or paste text first");
      return;
    }
    const prompt = promptById(lastPadPromptId);
    setCleaning(true);
    const result = await runCleanup(raw, prompt);
    setCleaning(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPadResult(result.text);
    addHistory({
      id: uid(),
      createdAt: new Date().toISOString(),
      raw,
      cleaned: result.text,
      promptName: prompt.name,
      promptId: prompt.id,
      recordingId: null,
      folderId: null,
      archived: false,
      status: "complete",
      source: "custom",
      engine: settings.model || settings.provider,
      previousRaw: [],
      exchange: result.exchange,
    });
    toast.success(`Cleaned with ${prompt.name}`);
  };

  if (compact) {
    return (
      <button
        id="talkai-pad-summary"
        type="button"
        className="talkai-pad-summary flex w-full items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 text-left shadow-border"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Pad
          </p>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {pad.trim() ? pad.replace(/\s+/g, " ") : "Drop text here to clean it"}
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{pad.length}</span>
      </button>
    );
  }

  return (
    <section
      id="talkai-pad-page"
      className="talkai-page talkai-pad-page flex h-full flex-col gap-5"
    >
      <header className="talkai-page-header flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Pad</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop or paste text, pick a prompt, clean it. Inserts from recordings land here too.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => void copy(pad, "Pad copied")}
            aria-label="Copy pad"
          >
            <Copy className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => {
              setPad("");
              setPadResult("");
            }}
            aria-label="Clear pad"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </header>

      <div
        id="talkai-pad-editor"
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => void onDrop(e)}
        className={cn(
          "talkai-pad-editor",
          "relative rounded-xl bg-card p-3 shadow-border transition-[background-color,box-shadow] duration-150 sm:p-4",
          dragging && "bg-elevated shadow-border-hover",
        )}
      >
        {dragging ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl bg-background/70">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ArrowDownToLine className="size-4 text-primary" />
              Drop to load
            </p>
          </div>
        ) : null}
        <Textarea
          value={pad}
          onChange={(e) => setPad(e.target.value)}
          placeholder="Drop a transcript, paste notes, or type — then clean with any prompt."
          className="min-h-56 bg-transparent shadow-none"
        />
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <PromptSelect
            value={lastPadPromptId}
            onChange={setLastPadPrompt}
            className="sm:min-w-0 sm:flex-1"
          />
          <Button
            onClick={() => void clean()}
            disabled={cleaning || !pad.trim()}
            className="sm:w-40"
          >
            <Sparkles className="size-4" />
            {cleaning ? "Cleaning…" : "Clean"}
          </Button>
        </div>
        <p className="mt-2 text-xs tabular-nums text-muted-foreground">{pad.length} characters</p>
      </div>

      {padResult ? (
        <div
          id="talkai-pad-result"
          className="talkai-pad-result rounded-xl bg-card p-4 shadow-border"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Cleaned · {promptById(lastPadPromptId).name}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void copy(padResult, "Result copied")}
              >
                <Copy className="size-3.5" />
                Copy
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPad(padResult)}>
                Use as source
              </Button>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{padResult}</p>
        </div>
      ) : null}
    </section>
  );
}
