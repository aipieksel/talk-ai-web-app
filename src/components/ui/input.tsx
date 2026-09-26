import { forwardRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "talkai-input",
        "flex h-11 w-full rounded-xl bg-secondary px-3 text-sm text-foreground shadow-border",
        "placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "talkai-textarea",
        "flex min-h-32 w-full rounded-lg bg-secondary px-3 py-3 text-sm text-foreground shadow-border",
        "placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:opacity-50 resize-y leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
