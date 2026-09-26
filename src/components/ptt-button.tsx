import { useRef, type PointerEvent } from "react";
import { useVoice } from "@/stores/voice";
import { cn } from "@/lib/utils";

export function PttButton({
  compact = false,
  dock = false,
}: {
  compact?: boolean;
  dock?: boolean;
}) {
  const flow = useVoice((s) => s.flow);
  const start = useVoice((s) => s.start);
  const done = useVoice((s) => s.done);
  const pointerUp = useVoice((s) => s.pointerUp);
  const holdRef = useRef<number | null>(null);
  const holding = useRef(false);
  const recording = flow === "recording" || flow === "preparing" || flow === "paused";
  const busy = flow === "transcribing" || flow === "cleaning";

  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (busy) return;
    if (flow === "recording" || flow === "preparing" || flow === "paused") {
      e.preventDefault();
      void done();
      return;
    }
    if (flow !== "idle") return;
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
    holding.current = true;
    holdRef.current = window.setTimeout(() => {
      void start("manual", true);
    }, 180);
  };

  const onUp = () => {
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
      if (holding.current && useVoice.getState().flow === "idle") {
        void start("manual", false);
      }
    }
    holding.current = false;
    pointerUp();
  };

  const label = recording ? "Done" : "TALK";
  const aria = recording ? "Stop and transcribe" : "Hold to talk";

  if (dock) {
    return (
      <button
        id="talkai-record-button-mobile"
        type="button"
        aria-label={aria}
        disabled={busy}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={onUp}
        className={cn(
          "talkai-record-button talkai-record-button--dock",
          "grid size-16 place-items-center rounded-full shadow-lift",
          "font-display text-sm leading-none tracking-tight",
          "transition-transform duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          "active:scale-[0.96] disabled:opacity-50",
          recording
            ? "bg-background text-foreground shadow-border"
            : "bg-primary text-primary-foreground",
          recording && "scale-[0.97]",
        )}
      >
        {label}
      </button>
    );
  }

  if (compact) {
    return (
      <button
        id="talkai-record-button-compact"
        type="button"
        aria-label={aria}
        disabled={busy}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={onUp}
        className={cn(
          "talkai-record-button talkai-record-button--compact",
          "grid size-20 place-items-center rounded-full shadow-lift",
          "font-display text-lg leading-none tracking-tight",
          "transition-transform duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          "active:scale-[0.96] disabled:opacity-50",
          recording
            ? "bg-background text-foreground shadow-border"
            : "bg-primary text-primary-foreground",
          recording && "scale-[0.97]",
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="talkai-record-control flex flex-col items-center gap-2">
      <div className="talkai-record-control__status flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        <span
          className={cn(
            "size-1.5 rounded-full",
            recording ? "bg-live led-live" : busy ? "bg-primary" : "bg-ready",
          )}
        />
        {recording ? "Live" : busy ? "Working" : "Ready"}
      </div>
      <button
        id="talkai-record-button-desktop"
        type="button"
        aria-label={aria}
        disabled={busy}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={onUp}
        className={cn(
          "talkai-record-button",
          "ptt-ring relative grid size-36 place-items-center rounded-full shadow-lift",
          "transition-transform duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          "active:scale-[0.96] disabled:opacity-50",
          recording && "scale-[0.97]",
        )}
      >
        <span className="pointer-events-none absolute inset-3 rounded-full shadow-border" />
        <span
          className={cn(
            "relative grid size-24 place-items-center rounded-full transition-colors duration-200",
            recording ? "bg-background text-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          <span className="font-display text-2xl leading-none tracking-tight">{label}</span>
        </span>
      </button>
      <p className="talkai-record-control__hint max-w-64 text-center text-xs text-muted-foreground">
        {recording ? "Tap Done to transcribe and clean up" : "Hold to talk · tap to start"}
      </p>
    </div>
  );
}
