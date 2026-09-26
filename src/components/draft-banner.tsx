import { Button } from "@/components/ui/button";
import { formatElapsed } from "@/lib/utils";
import { useVoice } from "@/stores/voice";

export function DraftBanner() {
  const recovered = useVoice((s) => s.recovered);
  const flow = useVoice((s) => s.flow);
  const finish = useVoice((s) => s.finishRecovered);
  const cont = useVoice((s) => s.continueRecovered);
  const discard = useVoice((s) => s.discardRecovered);

  if (!recovered || flow !== "idle") return null;

  const savedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(recovered.createdAt);
  const sizeMb = (recovered.size / (1024 * 1024)).toFixed(1);

  return (
    <div
      id="talkai-recording-recovery"
      className="talkai-recording-recovery mb-4 rounded-xl bg-card p-4 shadow-border"
    >
      <p className="text-sm font-medium">
        Unfinished recording found
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        TalkAI recovered this unfinished recording from this device.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {savedAt} · {formatElapsed(recovered.elapsedMs)} · {sizeMb} MB
        {recovered.live
          ? ` · “${recovered.live.slice(0, 80)}${recovered.live.length > 80 ? "…" : ""}”`
          : ""}
      </p>
      <div className="talkai-recording-recovery__actions mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void finish()}>
          Finish and save
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void cont()}>
          Continue recording
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void discard()}>
          Discard
        </Button>
      </div>
    </div>
  );
}
