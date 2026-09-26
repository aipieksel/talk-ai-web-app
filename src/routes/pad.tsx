import { createFileRoute } from "@tanstack/react-router";
import { InsertPad } from "@/components/insert-pad";

export const Route = createFileRoute("/pad")({ ssr: false, component: PadPage });

function PadPage() {
  return <InsertPad />;
}
