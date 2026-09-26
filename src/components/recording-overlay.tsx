import { Check, Copy, GripHorizontal, Pause, Play, Share2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { LiveCaption } from "@/components/live-caption";
import { Overview, Waveform } from "@/components/waveform";
import { APP_NAME } from "@/lib/brand";
import { formatElapsed } from "@/lib/utils";
import { useApp } from "@/stores/app";
import { useVoice } from "@/stores/voice";
import { cn } from "@/lib/utils";
import { postNativeWidget } from "@/lib/native-widget";

const TRIGGERS: Record<string, string> = {
  shortcut: "Shortcut",
  wake: "Wake phrase",
  menu: "Menu",
  manual: "Talk button",
  overlay: "Overlay",
  recover: "Recovered",
};

export function RecordingOverlay() {
  const flow = useVoice((s) => s.flow);
  const overlayMode = useApp((s) => s.settings.overlayMode);
  if (flow === "idle") return null;
  const capturing = flow === "recording" || flow === "preparing" || flow === "paused";
  if (overlayMode === "float" && capturing) return <FloatRecorder />;
  if (overlayMode === "float") return <FloatRecorder expanded />;
  return <OverlayBody />;
}

function statusLabel(flow: string, armed: boolean) {
  if (flow === "preparing") return "Preparing microphone…";
  if (flow === "recording") return armed ? "Say your send phrase, or tap Done" : "Listening";
  if (flow === "paused") return "Paused";
  if (flow === "transcribing") return "Transcribing…";
  if (flow === "cleaning") return "Cleaning…";
  if (flow === "complete") return "Ready";
  if (flow === "cleanup-failed") return "Cleanup failed · raw text kept";
  if (flow === "no-speech") return "No speech detected";
  return "Something went wrong";
}

export function OverlayBody({ embedded = false }: { embedded?: boolean }) {
  const flow = useVoice((s) => s.flow);
  const trigger = useVoice((s) => s.trigger);
  const elapsed = useVoice((s) => s.elapsedMs);
  const waveform = useVoice((s) => s.waveform);
  const live = useVoice((s) => s.live);
  const raw = useVoice((s) => s.raw);
  const finalText = useVoice((s) => s.finalText);
  const error = useVoice((s) => s.error);
  const workStatus = useVoice((s) => s.workStatus);
  const workProgress = useVoice((s) => s.workProgress);
  const armed = useVoice((s) => s.armed);
  const setFinalText = useVoice((s) => s.setFinalText);
  const done = useVoice((s) => s.done);
  const cancel = useVoice((s) => s.cancel);
  const pause = useVoice((s) => s.pause);
  const resume = useVoice((s) => s.resume);
  const dismiss = useVoice((s) => s.dismiss);
  const copy = useVoice((s) => s.copy);
  const insert = useVoice((s) => s.insert);
  const share = useVoice((s) => s.share);
  const retry = useVoice((s) => s.retryCleanup);
  const defaultPromptName = useApp(
    (s) => s.prompts.find((p) => p.id === s.defaultPromptId)?.name ?? "Default Cleanup",
  );
  const cleanupEnabled = useApp((s) => s.settings.cleanupEnabled);
  const transcript = useRef<HTMLTextAreaElement>(null);

  const recording = flow === "recording" || flow === "preparing";
  const paused = flow === "paused";
  const capturing = recording || paused;
  const working = flow === "transcribing" || flow === "cleaning" || flow === "preparing";
  const complete = flow === "complete" || flow === "cleanup-failed";
  const label = statusLabel(flow, armed);

  useEffect(() => {
    const field = transcript.current;
    if (!embedded || !complete || !field) return;
    field.style.height = "0px";
    field.style.height = `${field.scrollHeight}px`;
  }, [complete, embedded, finalText]);

  return (
    <div
      className={cn(
        "talkai-recording-overlay",
        embedded ? "talkai-recording-overlay--embedded" : "talkai-recording-overlay--modal",
        embedded
          ? "flex w-full justify-center"
          : "fixed inset-0 z-[80] flex items-end justify-center bg-background/80 p-3 pb-[max(5.5rem,env(safe-area-inset-bottom))] pt-10 sm:items-center sm:p-6 sm:pb-6",
      )}
    >
      <div
        id="talkai-recording-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Voice recording"
        className={cn(
          "talkai-recording-dialog flex w-full flex-col overflow-hidden rounded-xl bg-card shadow-lift enter",
          embedded ? "max-w-none" : "max-h-[92dvh] max-w-lg",
        )}
      >
        <header className="talkai-recording-dialog__header flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <div className="talkai-recording-dialog__status">
            <p className="talkai-recording-dialog__status-label text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {TRIGGERS[trigger] ?? APP_NAME} · {label}
              {flow === "cleaning" || (complete && cleanupEnabled) ? ` · ${defaultPromptName}` : ""}
            </p>
            <p className="talkai-recording-dialog__timer mt-1 font-mono text-2xl tabular-nums tracking-tight">
              {formatElapsed(elapsed)}
            </p>
          </div>
          <button
            id="talkai-recording-dismiss"
            type="button"
            onClick={() => {
              if (capturing) cancel();
              else dismiss();
              if (embedded) postNativeWidget({ action: "close" });
            }}
            className="talkai-recording-dialog__dismiss grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={capturing ? "Cancel" : "Dismiss"}
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="talkai-recording-dialog__visualizer px-5">
          <div className="talkai-recording-dialog__waveform h-28 overflow-hidden rounded-lg bg-background shadow-border">
            <Waveform samples={waveform} live={recording} />
          </div>
          {capturing ? (
            <div className="talkai-recording-dialog__overview mt-2 h-8 overflow-hidden rounded-md bg-background/60">
              <Overview samples={waveform} />
            </div>
          ) : null}
        </div>

        <div className="talkai-recording-dialog__content min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {capturing ? <LiveCaption text={live} lines={5} /> : null}
          {working && !capturing ? (
            <div className="talkai-recording-progress space-y-3">
              <p className="text-sm font-medium">{workStatus || label}</p>
              {workProgress !== null ? (
                <div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200"
                      style={{ width: `${Math.max(2, workProgress)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Model preparation · {workProgress}%
                  </p>
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your recording is safely saved while this finishes.
                </p>
              )}
            </div>
          ) : null}
          {complete ? (
            <Textarea
              id="talkai-recording-transcript"
              ref={transcript}
              value={finalText}
              onChange={(e) => setFinalText(e.target.value)}
              className={cn("min-h-40", embedded && "resize-none overflow-hidden")}
              aria-label="Transcript"
            />
          ) : null}
          {flow === "cleanup-failed" ? (
            <p className="mt-2 text-xs text-destructive">{error}</p>
          ) : null}
          {flow === "no-speech" || flow === "error" ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{error || label}</p>
          ) : null}
          {complete && raw && raw !== finalText ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Raw: {raw.length > 180 ? `${raw.slice(0, 180)}…` : raw}
            </p>
          ) : null}
        </div>

        <footer className="talkai-recording-dialog__actions flex flex-wrap gap-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          {capturing ? (
            <>
              <Button
                id="talkai-recording-cancel"
                variant="secondary"
                className="flex-1"
                onClick={cancel}
              >
                Cancel
              </Button>
              {paused ? (
                <Button
                  id="talkai-recording-resume"
                  variant="secondary"
                  className="flex-1"
                  onClick={resume}
                >
                  <Play className="size-4" />
                  Resume
                </Button>
              ) : (
                <Button
                  id="talkai-recording-pause"
                  variant="secondary"
                  className="flex-1"
                  onClick={pause}
                  disabled={flow === "preparing"}
                >
                  <Pause className="size-4" />
                  Pause
                </Button>
              )}
              <Button
                id="talkai-recording-done"
                className="flex-1"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void done();
                }}
                onClick={() => void done()}
              >
                Done
              </Button>
            </>
          ) : null}
          {complete ? (
            <>
              <Button
                id="talkai-recording-copy"
                variant="secondary"
                className="flex-1"
                onClick={() => void copy()}
              >
                <Copy className="size-4" />
                Copy
              </Button>
              <Button id="talkai-recording-insert" className="flex-1" onClick={() => void insert()}>
                <Check className="size-4" />
                Insert
              </Button>
              <Button
                id="talkai-recording-share"
                variant="outline"
                size="icon"
                onClick={() => void share()}
                aria-label="Share"
              >
                <Share2 className="size-4" />
              </Button>
              {flow === "cleanup-failed" ? (
                <Button variant="outline" className="w-full" onClick={() => void retry()}>
                  Retry cleanup
                </Button>
              ) : null}
            </>
          ) : null}
          {flow === "no-speech" || flow === "error" ? (
            <Button
              className="w-full"
              onClick={() => {
                dismiss();
                if (embedded) postNativeWidget({ action: "close" });
              }}
            >
              Dismiss
            </Button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

export function FloatRecorder({
  expanded = false,
  anchored = false,
}: {
  expanded?: boolean;
  anchored?: boolean;
}) {
  const flow = useVoice((s) => s.flow);
  const elapsed = useVoice((s) => s.elapsedMs);
  const waveform = useVoice((s) => s.waveform);
  const live = useVoice((s) => s.live);
  const finalText = useVoice((s) => s.finalText);
  const raw = useVoice((s) => s.raw);
  const error = useVoice((s) => s.error);
  const workStatus = useVoice((s) => s.workStatus);
  const workProgress = useVoice((s) => s.workProgress);
  const armed = useVoice((s) => s.armed);
  const done = useVoice((s) => s.done);
  const cancel = useVoice((s) => s.cancel);
  const pause = useVoice((s) => s.pause);
  const resume = useVoice((s) => s.resume);
  const dismiss = useVoice((s) => s.dismiss);
  const copy = useVoice((s) => s.copy);
  const insert = useVoice((s) => s.insert);
  const setFinalText = useVoice((s) => s.setFinalText);
  const floatX = useApp((s) => s.settings.floatX);
  const floatY = useApp((s) => s.settings.floatY);
  const patch = useApp((s) => s.patchSettings);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const recording = flow === "recording" || flow === "preparing";
  const paused = flow === "paused";
  const capturing = recording || paused;
  const complete = flow === "complete" || flow === "cleanup-failed";

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      const x = Math.max(8, Math.min(window.innerWidth - 280, e.clientX - drag.current.dx));
      const y = Math.max(8, Math.min(window.innerHeight - 80, e.clientY - drag.current.dy));
      patch({ floatX: x, floatY: y });
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [patch]);

  return (
    <div
      id="talkai-floating-recorder"
      ref={panel}
      className={cn(
        "talkai-floating-recorder w-[min(22rem,calc(100vw-1.5rem))] rounded-xl bg-card shadow-lift enter",
        anchored ? "relative" : "fixed z-50",
      )}
      style={anchored ? undefined : { left: floatX, top: floatY }}
      role="dialog"
      aria-label="Floating recorder"
    >
      <div
        className="talkai-floating-recorder__handle flex cursor-grab items-center justify-between gap-2 px-3 pt-2 active:cursor-grabbing"
        onPointerDown={(e) => {
          const rect = panel.current?.getBoundingClientRect();
          if (!rect) return;
          drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        }}
      >
        <GripHorizontal className="size-4 text-subtle" />
        <span className="font-mono text-sm tabular-nums">{formatElapsed(elapsed)}</span>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          onClick={() => {
            if (capturing) cancel();
            else dismiss();
            postNativeWidget({ action: "close" });
          }}
          aria-label={capturing ? "Cancel" : "Dismiss"}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="talkai-floating-recorder__content px-3">
        <div className="talkai-floating-recorder__waveform h-12 overflow-hidden rounded-md bg-background">
          <Waveform samples={waveform} live={recording} compact />
        </div>
        {capturing ? (
          <div className="mt-2">
            <LiveCaption text={live} lines={3} empty="Listening…" />
            <p className="mt-1 text-[11px] text-subtle">{statusLabel(flow, armed)}</p>
          </div>
        ) : null}
        {complete && expanded ? (
          <Textarea
            value={finalText}
            onChange={(e) => setFinalText(e.target.value)}
            className="mt-2 min-h-24 text-sm"
            aria-label="Transcript"
          />
        ) : null}
        {flow === "error" || flow === "no-speech" ? (
          <p className="mt-2 text-xs text-muted-foreground">{error}</p>
        ) : null}
        {(flow === "transcribing" || flow === "cleaning") && expanded ? (
          <div className="mt-2 space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {workStatus || statusLabel(flow, armed)}
            </p>
            {workProgress !== null ? (
              <div className="h-1 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.max(2, workProgress)}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="talkai-floating-recorder__actions flex flex-wrap gap-1.5 p-3">
        {capturing ? (
          <>
            {paused ? (
              <Button size="sm" variant="secondary" className="flex-1" onClick={resume}>
                <Play className="size-3.5" />
                Resume
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={pause}
                disabled={flow === "preparing"}
              >
                <Pause className="size-3.5" />
                Pause
              </Button>
            )}
            <Button
              size="sm"
              className="flex-1"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void done();
              }}
              onClick={() => void done()}
            >
              Done
            </Button>
          </>
        ) : null}
        {complete ? (
          <>
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => void copy()}>
              Copy
            </Button>
            <Button size="sm" className="flex-1" onClick={() => void insert()}>
              Insert
            </Button>
          </>
        ) : null}
        {flow === "no-speech" || flow === "error" ? (
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              dismiss();
              postNativeWidget({ action: "close" });
            }}
          >
            Dismiss
          </Button>
        ) : null}
      </div>
      {complete && raw && raw !== finalText ? (
        <p className="px-3 pb-3 text-[11px] text-subtle">Raw kept</p>
      ) : null}
    </div>
  );
}
