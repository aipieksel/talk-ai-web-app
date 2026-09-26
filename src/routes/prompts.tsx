import { createFileRoute } from "@tanstack/react-router";
import { Copy, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { DEFAULT_PROMPT_ID } from "@/lib/types";
import { cn } from "@/lib/utils";
import { uiDomId } from "@/lib/ui-names";
import { useApp } from "@/stores/app";

export const Route = createFileRoute("/prompts")({ ssr: false, component: PromptsPage });

function PromptsPage() {
  const prompts = useApp((s) => s.prompts);
  const defaultPromptId = useApp((s) => s.defaultPromptId);
  const selectedPromptId = useApp((s) => s.selectedPromptId);
  const cleanupEnabled = useApp((s) => s.settings.cleanupEnabled);
  const hydrated = useApp((s) => s.hydrated);
  const addPrompt = useApp((s) => s.addPrompt);
  const duplicatePrompt = useApp((s) => s.duplicatePrompt);
  const updatePrompt = useApp((s) => s.updatePrompt);
  const deletePrompt = useApp((s) => s.deletePrompt);
  const setDefaultPrompt = useApp((s) => s.setDefaultPrompt);
  const setSelectedPrompt = useApp((s) => s.setSelectedPrompt);
  const current = prompts.find((p) => p.id === selectedPromptId) ?? prompts[0];
  const [name, setName] = useState(current?.name ?? "");
  const [instructions, setInstructions] = useState(current?.instructions ?? "");
  const dirty =
    current && !current.builtIn && (name !== current.name || instructions !== current.instructions);

  useEffect(() => {
    if (!current) return;
    setName(current.name);
    setInstructions(current.instructions);
  }, [current?.id]);

  const save = () => {
    if (!current || current.builtIn) return;
    if (!name.trim() || !instructions.trim()) {
      toast.error("Name and instructions are required");
      return;
    }
    updatePrompt(current.id, { name: name.trim(), instructions: instructions.trim() });
    toast.success("Saved");
  };

  const setDefault = () => {
    if (!current) return;
    if (!current.builtIn && (!name.trim() || !instructions.trim())) {
      toast.error("Save a valid prompt before making it default");
      return;
    }
    if (dirty) save();
    setDefaultPrompt(current.id);
    toast.success(
      cleanupEnabled
        ? `${current.name} is the default cleanup prompt`
        : `${current.name} is the default — AI cleanup is now on`,
    );
  };

  return (
    <div
      id="talkai-prompts-page"
      className="talkai-page talkai-prompts-page mx-auto flex max-w-3xl flex-col gap-5"
    >
      <header className="talkai-page-header flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Prompts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {prompts.length} prompts · recordings use the default
            {hydrated && current ? ` · viewing ${current.name}` : ""}.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            const id = addPrompt();
            setSelectedPrompt(id);
          }}
        >
          <Plus className="size-4" />
          New
        </Button>
      </header>

      <div
        id="talkai-prompt-list"
        className="talkai-prompt-list flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {prompts.map((p) => (
          <button
            id={uiDomId("prompt", p.id)}
            key={p.id}
            type="button"
            data-prompt-id={p.id}
            onClick={() => {
              if (dirty && current && !current.builtIn) {
                if (!name.trim() || !instructions.trim()) {
                  toast.error("Finish the current prompt before switching");
                  return;
                }
                updatePrompt(current.id, { name: name.trim(), instructions: instructions.trim() });
              }
              setSelectedPrompt(p.id);
            }}
            className={cn(
              "talkai-prompt-chip",
              "h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors duration-150",
              p.id === selectedPromptId
                ? "is-selected bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {p.name}
            {p.id === defaultPromptId ? " · default" : ""}
          </button>
        ))}
      </div>

      {current ? (
        <div
          id="talkai-prompt-editor"
          className="talkai-prompt-editor space-y-4 rounded-xl bg-card p-4 shadow-border sm:p-5"
          data-prompt-id={current.id}
        >
          <div className="talkai-prompt-editor__status flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-secondary px-2.5 py-1">
              {current.builtIn ? "Built-in" : "Custom"}
            </span>
            {current.id === defaultPromptId ? (
              <span className="rounded-full bg-secondary px-2.5 py-1">Active default</span>
            ) : null}
            {hydrated ? (
              <span className="rounded-full bg-secondary px-2.5 py-1">
                {cleanupEnabled ? "AI cleanup on" : "Cleanup off until you set a default"}
              </span>
            ) : null}
          </div>
          <Input
            id="talkai-prompt-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={current.builtIn}
          />
          <Textarea
            id="talkai-prompt-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            disabled={current.builtIn}
            className="min-h-56"
          />
          <div className="talkai-prompt-editor__actions flex flex-wrap gap-2">
            {!current.builtIn ? (
              <Button onClick={save} disabled={!dirty}>
                Save
              </Button>
            ) : null}
            <Button variant="secondary" onClick={setDefault}>
              <Star className="size-4" />
              Set as default
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const id = duplicatePrompt(current.id);
                if (id) setSelectedPrompt(id);
              }}
            >
              <Copy className="size-4" />
              Duplicate
            </Button>
            {!current.builtIn ? (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  deletePrompt(current.id);
                  setSelectedPrompt(DEFAULT_PROMPT_ID);
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
