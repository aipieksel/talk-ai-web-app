import { cn } from "@/lib/utils";

/** Concentric talk-button mark from the app cover. */
export function BrandMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "size-12" : size === "sm" ? "size-8" : "size-10";
  return (
    <span
      className={cn("relative grid shrink-0 place-items-center rounded-xl bg-black", box, className)}
      aria-hidden
    >
      <TalkMark className="size-[82%]" />
    </span>
  );
}

export function TalkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
      <circle cx="16" cy="16" r="11.1" stroke="#F5D90A" strokeWidth="2.35" />
      <circle cx="16" cy="16" r="7.35" stroke="#F5D90A" strokeWidth="2.15" />
      <circle cx="16" cy="16" r="3.55" stroke="#F5D90A" strokeWidth="2" />
      <circle cx="16" cy="16" r="1.35" fill="#F5D90A" />
      <circle cx="20.35" cy="16" r="0.72" fill="#F5D90A" />
    </svg>
  );
}
