import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useApp } from "@/stores/app";

export function PromptSelect({
  value,
  onChange,
  className,
  id,
  compact = false,
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
  id?: string;
  compact?: boolean;
}) {
  const prompts = useApp((s) => s.prompts);
  const defaultPromptId = useApp((s) => s.defaultPromptId);
  return (
    <NativeSelect
      id={id}
      value={prompts.some((p) => p.id === value) ? value : defaultPromptId}
      onChange={(e) => onChange(e.target.value)}
      className={cn("talkai-prompt-select min-w-0", className)}
      aria-label="Cleanup prompt"
    >
      {prompts.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {!compact && p.id === defaultPromptId ? " · default" : ""}
        </option>
      ))}
    </NativeSelect>
  );
}
