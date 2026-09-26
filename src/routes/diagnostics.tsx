import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RowSwitch } from "@/components/ui/label";
import { clearLog, logText, readLog } from "@/lib/log";
import { useApp } from "@/stores/app";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/diagnostics")({ ssr: false, component: DiagnosticsPage });

const CATS = [
  "lifecycle",
  "settings",
  "permissions",
  "microphone",
  "audio",
  "shortcut",
  "wake phrase",
  "send phrase",
  "insert phrase",
  "pipeline",
  "transcription",
  "AI cleanup",
  "insertion target",
  "media",
];

function DiagnosticsPage() {
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);
  const [tick, setTick] = useState(0);
  const entries = useMemo(() => readLog(), [tick]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(logText());
      toast.success("Log copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const download = () => {
    const blob = new Blob([logText() || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "walkie-diagnostics.log";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="talkai-diagnostics-page"
      className="talkai-page talkai-diagnostics-page mx-auto flex max-w-xl flex-col gap-6"
    >
      <header className="talkai-page-header">
        <h1 className="font-display text-3xl tracking-tight">Diagnostics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Structured events stay on this device. Secrets and authorization headers are never stored.
        </p>
      </header>

      <section
        id="talkai-diagnostics-controls"
        className="talkai-section talkai-diagnostics-controls space-y-4 rounded-xl bg-card p-4 shadow-border sm:p-5"
      >
        <RowSwitch
          label="Diagnostic logging"
          hint="When off, new events are not recorded. Existing lines remain until you clear them."
          checked={settings.diagnosticLogging}
          onCheckedChange={(v) => patch({ diagnosticLogging: v })}
        />
        <p className="text-xs text-muted-foreground">
          Stored as walkie-diagnostics in local storage.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void copy()}>
            Copy log
          </Button>
          <Button variant="secondary" onClick={download}>
            Download log
          </Button>
          <Button variant="secondary" onClick={() => setTick((n) => n + 1)}>
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              clearLog();
              setTick((n) => n + 1);
            }}
          >
            Clear
          </Button>
        </div>
      </section>

      <section
        id="talkai-diagnostics-categories"
        className="talkai-section talkai-diagnostics-categories"
      >
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Categories
        </h2>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {CATS.map((c) => (
            <li
              key={c}
              className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground"
            >
              {c}
            </li>
          ))}
        </ul>
      </section>

      <section
        id="talkai-diagnostics-events"
        className="talkai-section talkai-diagnostics-events rounded-xl bg-card p-4 shadow-border"
      >
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Recent
        </h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No events yet. Record something and they will appear here.
          </p>
        ) : (
          <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto font-mono text-[11px] leading-relaxed text-muted-foreground">
            {entries
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id} className="talkai-diagnostic-event" data-event-id={e.id}>
                  <span className="text-subtle">{e.t.slice(11, 19)}</span>{" "}
                  <span className="text-foreground">{e.cat}</span> {e.msg}
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
