import { cn } from "@/lib/utils";

export function LiveCaption({
  text,
  lines = 5,
  className,
  empty = "Speak now. The last lines stay here as you go.",
}: {
  text: string;
  lines?: number;
  className?: string;
  empty?: string;
}) {
  return (
    <div
      className={cn("talkai-live-caption overflow-hidden", className)}
      style={{ height: `calc(${lines} * 1.5em)` }}
    >
      <p className="talkai-live-caption__text flex h-full flex-col justify-end text-sm leading-relaxed whitespace-pre-wrap break-words">
        <span className={text ? "text-foreground" : "text-subtle"}>{text || empty}</span>
      </p>
    </div>
  );
}
