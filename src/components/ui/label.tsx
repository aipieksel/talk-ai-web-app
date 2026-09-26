import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("talkai-label text-sm font-medium text-foreground leading-none", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="talkai-field flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p> : null}
    </div>
  );
}

export function RowSwitch({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="talkai-field talkai-field--switch flex items-start justify-between gap-4 py-1">
      <div className="talkai-field__content min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
    </div>
  );
}
