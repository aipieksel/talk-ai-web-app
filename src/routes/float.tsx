import { createFileRoute } from "@tanstack/react-router";
import { OverlayBody } from "@/components/recording-overlay";
import { ThemeRoot } from "@/components/theme-root";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { resizeNativeWidget } from "@/lib/native-widget";
import { useVoice } from "@/stores/voice";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/float")({ ssr: false, component: FloatPage });

function FloatPage() {
  const { user, isPending } = useCurrentUserState();
  const flow = useVoice((s) => s.flow);
  const start = useVoice((s) => s.start);
  const content = useRef<HTMLDivElement>(null);
  const requestedRecording =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("record") === "1";

  useEffect(() => {
    document.documentElement.classList.add("talkai-widget-document");
    document.body.classList.add("talkai-widget-document");
    const resize = () => {
      const contentHeight = Math.ceil(content.current?.getBoundingClientRect().height ?? 0);
      resizeNativeWidget(Math.max(220, Math.min(820, contentHeight)));
    };
    const observer = new ResizeObserver(resize);
    if (content.current) observer.observe(content.current);
    resize();
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("talkai-widget-document");
      document.body.classList.remove("talkai-widget-document");
    };
  }, [isPending, user?.id]);

  if (authEnabled && isPending) return null;
  if (authEnabled && !user) return <RedirectToSignIn />;

  return (
    <div
      id="talkai-float-page"
      ref={content}
      className="talkai-page talkai-float-page min-h-0 bg-transparent p-2 [container-type:inline-size]"
    >
      <ThemeRoot />
      {flow === "idle" ? (
        requestedRecording ? null : (
          <div className="talkai-float-launcher rounded-xl bg-card p-4 shadow-lift">
            <p className="text-sm font-medium">Floating recorder</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Starts a take in this compact window from anywhere on your Mac.
            </p>
            <Button
              id="talkai-float-start"
              className="mt-3 w-full"
              onClick={() => void start("overlay")}
            >
              Start recording
            </Button>
          </div>
        )
      ) : (
        <OverlayBody embedded />
      )}
    </div>
  );
}
