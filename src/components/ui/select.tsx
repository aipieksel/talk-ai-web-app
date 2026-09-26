import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "talkai-select",
        "h-11 w-full rounded-md bg-secondary px-3 text-sm text-foreground shadow-border outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
