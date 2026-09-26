import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DraftBanner } from "@/components/draft-banner";
import { HistoryDetail } from "@/components/history-detail";
import { LibraryList } from "@/components/library-list";
import { useApp } from "@/stores/app";

export const Route = createFileRoute("/")({ ssr: false, component: Home });

function Home() {
  const navigate = useNavigate();
  const selectedId = useApp((s) => s.selectedId);

  return (
    <div
      id="talkai-library-page"
      className="talkai-page talkai-library-page flex flex-col gap-6 lg:flex-row lg:items-start"
    >
      <div className="talkai-library-page__list flex min-h-0 min-w-0 flex-1 flex-col">
        <DraftBanner />
        <LibraryList
          onOpen={(id) => {
            void navigate({ to: "/item/$id", params: { id } });
          }}
        />
      </div>

      <aside
        id="talkai-recording-detail-panel"
        className="talkai-library-page__detail hidden min-h-[28rem] w-[26rem] shrink-0 lg:block"
      >
        {selectedId ? (
          <HistoryDetail id={selectedId} onClose={() => useApp.getState().select(null)} />
        ) : (
          <div className="talkai-empty-state flex h-full min-h-[28rem] items-center justify-center rounded-xl bg-card px-6 text-center shadow-border">
            <p className="text-sm text-muted-foreground">Select a transcript to open it here.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
