import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HistoryDetail } from "@/components/history-detail";
import { useApp } from "@/stores/app";
import { useEffect } from "react";

export const Route = createFileRoute("/item/$id")({
  ssr: false,
  component: ItemPage,
});

function ItemPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const exists = useApp((s) => s.history.some((h) => h.id === id));

  useEffect(() => {
    useApp.getState().select(id);
  }, [id]);

  useEffect(() => {
    if (!exists) {
      void navigate({ to: "/" });
    }
  }, [exists, navigate]);

  if (!exists) return null;

  return (
    <div
      id="talkai-recording-page"
      className="talkai-page talkai-recording-page mx-auto w-full max-w-2xl pb-4"
    >
      <HistoryDetail
        id={id}
        onClose={() => {
          useApp.getState().select(null);
          void navigate({ to: "/" });
        }}
      />
    </div>
  );
}
