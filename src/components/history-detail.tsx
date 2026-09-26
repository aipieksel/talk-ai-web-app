import { ClipboardPaste, Copy, FolderInput, Play, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PromptSelect } from "@/components/prompt-select";
import { NativeSelect } from "@/components/ui/select";
import { loadRecording } from "@/lib/idb";
import { cn, formatWhenLong } from "@/lib/utils";
import { uiDomId } from "@/lib/ui-names";
import { useApp } from "@/stores/app";
import { useVoice } from "@/stores/voice";

type Tab = "cleaned" | "raw";

export function HistoryDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const item = useApp((s) => s.history.find((h) => h.id === id));
  const folders = useApp((s) => s.folders);
  const defaultPromptId = useApp((s) => s.defaultPromptId);
  const moveHistory = useApp((s) => s.moveHistory);
  const deleteHistory = useApp((s) => s.deleteHistory);
  const appendPad = useApp((s) => s.appendPad);
  const reclean = useVoice((s) => s.reclean);
  const retranscribe = useVoice((s) => s.retranscribe);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [promptId, setPromptId] = useState(defaultPromptId);
  const [busy, setBusy] = useState<"clean" | "transcribe" | null>(null);
  const [tab, setTab] = useState<Tab>("cleaned");

  useEffect(() => {
    setPromptId(item?.promptId || defaultPromptId);
    setTab(item?.cleaned?.trim() ? "cleaned" : "raw");
  }, [item?.id, item?.promptId, item?.cleaned, defaultPromptId]);

  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    (async () => {
      if (!item?.recordingId) return;
      const blob = await loadRecording(item.recordingId);
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setAudioUrl(url);
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
      setAudioUrl(null);
    };
  }, [item?.recordingId]);

  if (!item) return null;

  const cleaned = item.cleaned?.trim() ?? "";
  const raw = item.raw.trim();
  const visible = tab === "cleaned" ? cleaned : raw;

  const copyText = async (text: string, ok = "Copied") => {
    if (!text.trim()) {
      toast.error("Nothing to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ok);
    } catch {
      toast.error("Could not copy");
    }
  };

  const onClean = async () => {
    setBusy("clean");
    try {
      await reclean(item.id, promptId);
      setTab("cleaned");
    } finally {
      setBusy(null);
    }
  };

  const onRetranscribe = async () => {
    setBusy("transcribe");
    try {
      await retranscribe(item.id);
      setTab("raw");
    } finally {
      setBusy(null);
    }
  };

  return (
    <article
      id={uiDomId("recording-detail", item.id)}
      className="talkai-recording-detail flex flex-col"
      data-recording-id={item.id}
    >
      <header className="talkai-recording-detail__header shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {item.source === "custom" ? "Custom" : item.status.replace("-", " ")}
            </p>
            <h2 className="mt-0.5 font-display text-xl tracking-tight">
              {formatWhenLong(item.createdAt)}
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {item.engine}
              {item.promptName ? ` · ${item.promptName}` : ""}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="relative min-w-0">
            <FolderInput className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <NativeSelect
              className="pl-8"
              value={item.folderId ?? ""}
              onChange={(e) => moveHistory(item.id, e.target.value || null)}
              aria-label="Folder"
            >
              <option value="">Unfiled</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="col-span-2 min-w-0">
            <PromptSelect compact value={promptId} onChange={setPromptId} />
          </div>
        </div>

        <div className="talkai-recording-toolbar grid h-12 grid-cols-5 overflow-hidden rounded-lg bg-secondary shadow-border">
          <ToolBtn label="Copy" title="Copy this tab" onClick={() => void copyText(visible)}>
            <Copy className="size-3.5" />
          </ToolBtn>
          <ToolBtn
            label="Pad"
            title="Copy and send to pad"
            onClick={() => {
              if (!visible.trim()) {
                toast.error("Nothing to copy");
                return;
              }
              appendPad(visible);
              void copyText(visible, "Copied and sent to pad");
            }}
          >
            <ClipboardPaste className="size-3.5" />
          </ToolBtn>
          <ToolBtn
            label="Clean"
            title="Run the selected prompt on the raw text"
            onClick={() => void onClean()}
            disabled={busy !== null || !raw}
            active={busy === "clean"}
          >
            <Sparkles className="size-3.5" />
          </ToolBtn>
          <ToolBtn
            label="Retry"
            title="Re-transcribe original recording"
            onClick={() => void onRetranscribe()}
            disabled={busy !== null || !item.recordingId}
            active={busy === "transcribe"}
          >
            <RotateCcw className={cn("size-3.5", busy === "transcribe" && "animate-spin")} />
          </ToolBtn>
          <ToolBtn
            label="Delete"
            title="Delete"
            danger
            last
            onClick={() => {
              deleteHistory(item.id);
              onClose();
            }}
          >
            <Trash2 className="size-3.5" />
          </ToolBtn>
        </div>
      </header>

      <div className="talkai-transcript-panel mt-3 overflow-hidden rounded-xl bg-card shadow-border">
        <div
          role="tablist"
          aria-label="Transcript"
          className="talkai-tabs grid grid-cols-2 border-b border-border"
        >
          <TabBtn active={tab === "cleaned"} onClick={() => setTab("cleaned")} label="Cleaned" />
          <TabBtn active={tab === "raw"} onClick={() => setTab("raw")} label="Raw" />
        </div>

        {audioUrl ? (
          <div className="border-b border-border px-4 py-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <Play className="size-3" />
              Recording
            </p>
            <audio controls src={audioUrl} className="w-full" />
          </div>
        ) : null}

        <div className="talkai-transcript-panel__content max-h-[min(70dvh,36rem)] overflow-y-auto px-4 py-4">
          {tab === "cleaned" && !cleaned ? (
            <div className="py-6 text-sm leading-relaxed text-muted-foreground">
              {item.cleanupFailure ? (
                <p className="text-destructive">{item.cleanupFailure}</p>
              ) : (
                <p>Not cleaned yet. Pick a prompt above, then Clean.</p>
              )}
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{visible || "—"}</p>
          )}

          {tab === "raw" && item.previousRaw.length > 0 ? (
            <section className="mt-6">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Previous transcripts
              </p>
              <ul className="mt-2 space-y-2">
                {item.previousRaw.map((t, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {item.exchange ? (
            <details className="mt-6">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Cleanup exchange
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                {item.exchange.provider} · {item.exchange.model} · HTTP {item.exchange.httpStatus}
              </p>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {item.exchange.responseJson}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function TabBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "talkai-tab",
        "relative h-10 text-sm font-medium transition-colors duration-150",
        active
          ? "is-active text-foreground after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ToolBtn({
  title,
  onClick,
  label,
  children,
  disabled,
  danger,
  last,
  active,
}: {
  title: string;
  onClick: () => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  last?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "talkai-toolbar-button",
        "flex min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-xs font-medium leading-none transition-colors duration-150",
        !last && "shadow-[inset_-1px_0_0_0_var(--color-border)]",
        danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-accent",
        disabled && "opacity-40",
        active && "is-active text-primary",
      )}
    >
      {children}
      <span className="truncate">{label}</span>
    </button>
  );
}
