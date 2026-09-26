import { FolderPlus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { previewText, type HistoryItem } from "@/lib/types";
import { cn, formatWhen } from "@/lib/utils";
import { uiDomId } from "@/lib/ui-names";
import { useApp } from "@/stores/app";

function statusLabel(item: HistoryItem): { text: string; tone: string } {
  if (item.status === "cleanup-failed") return { text: "Cleanup failed", tone: "text-destructive" };
  if (item.status === "no-speech") return { text: "No speech", tone: "text-muted-foreground" };
  if (item.status === "error") return { text: "Error", tone: "text-destructive" };
  return { text: "Complete", tone: "text-ready" };
}

export function LibraryList({ onOpen }: { onOpen: (id: string) => void }) {
  const history = useApp((s) => s.history);
  const folders = useApp((s) => s.folders);
  const scope = useApp((s) => s.scope);
  const search = useApp((s) => s.search);
  const selectedId = useApp((s) => s.selectedId);
  const setSearch = useApp((s) => s.setSearch);
  const setScope = useApp((s) => s.setScope);
  const addFolder = useApp((s) => s.addFolder);
  const select = useApp((s) => s.select);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return history.filter((h) => {
      if (h.archived) return false;
      if (scope === "custom") {
        if (h.source !== "custom") return false;
      } else if (scope === "unfiled") {
        if (h.folderId || h.source === "custom") return false;
      } else if (scope !== "all" && h.folderId !== scope) {
        return false;
      }
      if (!q) return true;
      return [h.raw, h.cleaned ?? "", h.promptName ?? "", h.engine]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [history, scope, search]);

  const allCount = history.filter((h) => !h.archived).length;
  const unfiledCount = history.filter(
    (h) => !h.archived && !h.folderId && h.source !== "custom",
  ).length;
  const customCount = history.filter((h) => !h.archived && h.source === "custom").length;

  const title =
    scope === "all"
      ? "All"
      : scope === "unfiled"
        ? "Unfiled"
        : scope === "custom"
          ? "Custom"
          : (folders.find((f) => f.id === scope)?.name ?? "Library");

  const submitFolder = () => {
    const id = addFolder(name);
    if (id) {
      setScope(id);
      setName("");
      setCreating(false);
    }
  };

  return (
    <div id="talkai-library" className="talkai-library flex min-h-0 flex-col lg:h-full">
      <header className="talkai-page-header talkai-library__header shrink-0 space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              {items.length} {items.length === 1 ? "item" : "items"}
            </p>
          </div>
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => setCreating((v) => !v)}
            aria-label="New folder"
          >
            <FolderPlus className="size-4" />
          </Button>
        </div>
        {creating ? (
          <form
            id="talkai-folder-form"
            className="talkai-folder-form flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitFolder();
            }}
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder name"
            />
            <Button type="submit" size="sm">
              Create
            </Button>
          </form>
        ) : null}
        <div className="talkai-library-filters flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ScopeChip
            active={scope === "all"}
            onClick={() => setScope("all")}
            label={`All ${allCount}`}
          />
          <ScopeChip
            active={scope === "unfiled"}
            onClick={() => setScope("unfiled")}
            label={`Unfiled ${unfiledCount}`}
          />
          <ScopeChip
            active={scope === "custom"}
            onClick={() => setScope("custom")}
            label={`Custom ${customCount}`}
          />
          {folders.map((f) => (
            <ScopeChip
              key={f.id}
              active={scope === f.id}
              onClick={() => setScope(f.id)}
              label={`${f.name} ${history.filter((h) => h.folderId === f.id && !h.archived).length}`}
            />
          ))}
        </div>
        <div className="talkai-library-search relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transcripts, prompts, models"
            className="pl-10"
          />
        </div>
      </header>

      <div className="talkai-library__content mt-4 pb-8 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-8">
        {items.length === 0 ? (
          <div className="talkai-empty-state rounded-xl bg-card px-5 py-10 text-center shadow-border">
            <p className="font-display text-xl">
              {search
                ? "Nothing matches"
                : history.length === 0
                  ? "No recordings yet"
                  : scope === "custom"
                    ? "No custom cleans yet"
                    : "This folder is empty"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {search
                ? "Try a different search."
                : scope === "custom"
                  ? "Drop text in the pad and clean it with a prompt."
                  : "Hold Talk. Your transcript will land here."}
            </p>
          </div>
        ) : (
          <ul id="talkai-recording-list" className="talkai-recording-list flex flex-col gap-2 pb-4">
            {items.map((item) => {
              const st = statusLabel(item);
              const active = selectedId === item.id;
              return (
                <li
                  id={uiDomId("recording", item.id)}
                  key={item.id}
                  className={cn("talkai-recording-card", active && "is-selected")}
                  data-recording-id={item.id}
                >
                  <button
                    type="button"
                    onClick={() => {
                      select(item.id);
                      onOpen(item.id);
                    }}
                    className={cn(
                      "w-full rounded-xl bg-card px-4 py-3.5 text-left shadow-border transition-[background-color,box-shadow] duration-150",
                      "hover:shadow-border-hover",
                      active && "is-selected bg-elevated shadow-border-hover",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {formatWhen(item.createdAt)}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-medium uppercase tracking-[0.12em]",
                          st.tone,
                        )}
                      >
                        {st.text}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed">
                      {previewText(item)}
                    </p>
                    <p className="mt-2 text-[11px] text-subtle">
                      {item.source === "custom" ? "Custom · " : ""}
                      {item.engine}
                      {item.promptName ? ` · ${item.promptName}` : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "talkai-filter-chip",
        "h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors",
        active
          ? "is-active bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
