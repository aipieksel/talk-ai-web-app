import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "talkai-switch",
        "peer inline-flex h-7 w-11 shrink-0 cursor-pointer items-center rounded-full shadow-border transition-colors",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-secondary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "talkai-switch__thumb",
          "pointer-events-none block size-5 rounded-full bg-foreground shadow-sm transition-transform",
          "data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-1",
          "data-[state=checked]:bg-primary-foreground",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
