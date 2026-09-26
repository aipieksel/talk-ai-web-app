import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { FolderOpen, Keyboard, NotebookPen, Settings2, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { LockScreen } from "@/components/lock-screen";
import { PttButton } from "@/components/ptt-button";
import { RecordingOverlay } from "@/components/recording-overlay";
import { ThemeRoot, AuthTheme } from "@/components/theme-root";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { eventMatchesShortcut, displayShortcut } from "@/lib/phrases";
import { luminance } from "@/lib/theme";
import { APP_NAME } from "@/lib/brand";
import { startVaultSync, stopVaultSync } from "@/lib/vault-sync";
import { resetBrowserAccountState } from "@/lib/account";
import { loadPublicGlobals } from "@/lib/server/global-settings";
import { cn } from "@/lib/utils";
import { useApp } from "@/stores/app";
import { useSession } from "@/stores/session";
import { useVoice } from "@/stores/voice";
import { syncNativeWidgetShortcut } from "@/lib/native-widget";
import { isRecordingUrlMode, mountRecordingUrlStylesheet } from "@/lib/recording-url-mode";

const NAV = [
  { to: "/", label: "Library", icon: FolderOpen },
  { to: "/prompts", label: "Prompts", icon: Sparkles },
  { to: "/pad", label: "Pad", icon: NotebookPen },
  { to: "/settings", label: "Settings", icon: Settings2 },
] as const;

function isStandalone() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

function BlankGate() {
  return (
    <div className="talkai-gate talkai-gate--blank min-h-dvh bg-background text-foreground">
      <ThemeRoot />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const router = useRouter();
  const settings = useApp((s) => s.settings);
  const hydrated = useApp((s) => s.hydrated);
  const defaultPromptName = useApp(
    (s) => s.prompts.find((p) => p.id === s.defaultPromptId)?.name ?? "Default Cleanup",
  );
  const start = useVoice((s) => s.start);
  const pause = useVoice((s) => s.pause);
  const flow = useVoice((s) => s.flow);
  const wakeStatus = useVoice((s) => s.wakeStatus);
  const syncWake = useVoice((s) => s.syncWake);
  const loadRecovered = useVoice((s) => s.loadRecovered);
  const sessionReady = useSession((s) => s.ready);
  const lockEnabled = useSession((s) => s.enabled);
  const unlocked = useSession((s) => s.unlocked);
  const refreshSession = useSession((s) => s.refresh);
  const { user, isPending } = useCurrentUserState();
  const [mac, setMac] = useState(false);
  const autoStarted = useRef(false);

  const isAuthRoute = pathname === "/login" || pathname === "/reset-password";
  const isItemRoute = pathname.startsWith("/item/");
  const libraryActive = pathname === "/" || isItemRoute;

  useEffect(() => {
    setMac(/Mac|iPhone|iPad|Macintosh/.test(`${navigator.platform} ${navigator.userAgent}`));
  }, []);

  useEffect(() => {
    if (authEnabled && (isPending || !user)) return;
    void router.preloadRoute({ to: "/" });
    void router.preloadRoute({ to: "/settings" });
    void router.preloadRoute({ to: "/prompts" });
    void router.preloadRoute({ to: "/pad" });
  }, [router, authEnabled, isPending, user]);

  useEffect(() => {
    if (authEnabled && isPending) return;
    if (!user) {
      stopVaultSync();
      resetBrowserAccountState();
      useApp.getState().resetAccount();
      useApp.getState().setHydrated(false);
      return;
    }
    if (user.isGuest) {
      stopVaultSync();
      let cancelled = false;
      void (async () => {
        try {
          const r = await loadPublicGlobals();
          if (cancelled) return;
          if (r.ok) {
            const next = Object.fromEntries(
              Object.entries(r.settings).filter(([, v]) => v !== undefined),
            );
            useApp.getState().patchSettings({ ...next, cleanupEnabled: true });
          }
        } catch {
          /* defaults */
        }
        if (!cancelled) useApp.getState().setHydrated(true);
      })();
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    useApp.getState().setHydrated(false);
    void (async () => {
      await startVaultSync(user.id);
      if (cancelled) return;
      useApp.getState().sweepAutoDelete();
      void loadRecovered();
      void refreshSession();
      useApp.getState().setHydrated(true);
    })();
    return () => {
      cancelled = true;
      stopVaultSync();
    };
  }, [authEnabled, isPending, user?.id, loadRecovered, refreshSession]);

  useEffect(() => {
    if (!hydrated) return;
    syncWake();
  }, [hydrated, settings.keepMicIdle, settings.wakeEnabled, settings.wakePhrase, flow, syncWake]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (lockEnabled && !unlocked) return;
      if (eventMatchesShortcut(e, settings.shortcut)) {
        e.preventDefault();
        if (flow === "idle" || flow === "paused") void start("shortcut");
      }
      if (e.key === "Escape" && (flow === "recording" || flow === "paused")) {
        useVoice.getState().cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.shortcut, flow, start, lockEnabled, unlocked]);

  useEffect(() => {
    if (!hydrated) return;
    syncNativeWidgetShortcut(settings.shortcut);
  }, [hydrated, settings.shortcut]);

  useEffect(() => mountRecordingUrlStylesheet(searchStr), [searchStr]);

  useEffect(() => {
    const onNativeShortcut = () => {
      if (lockEnabled && !unlocked) return;
      const current = useVoice.getState().flow;
      if (current === "idle" || current === "paused") void start("shortcut");
    };
    window.addEventListener("talkai:native-shortcut", onNativeShortcut);
    return () => window.removeEventListener("talkai:native-shortcut", onNativeShortcut);
  }, [start, lockEnabled, unlocked]);

  useEffect(() => {
    if (!hydrated || (!sessionReady && !user?.isGuest)) return;
    if (lockEnabled && !unlocked) return;
    if (autoStarted.current) return;
    const requested = isRecordingUrlMode(searchStr);
    if (!requested && settings.launchAction !== "record") return;
    if (!requested && !isStandalone()) return;
    autoStarted.current = true;
    const t = window.setTimeout(() => {
      if (useVoice.getState().flow === "idle") void start("overlay");
    }, 350);
    return () => window.clearTimeout(t);
  }, [
    hydrated,
    sessionReady,
    lockEnabled,
    unlocked,
    settings.launchAction,
    start,
    user?.isGuest,
    searchStr,
  ]);

  useEffect(() => {
    const kick = () => {
      if (settings.wakeEnabled && settings.keepMicIdle) syncWake();
    };
    window.addEventListener("pointerdown", kick, { once: true });
    return () => window.removeEventListener("pointerdown", kick);
  }, [settings.wakeEnabled, settings.keepMicIdle, syncWake]);

  const readyLabel =
    wakeStatus === "listening"
      ? "Wake listening"
      : flow === "idle"
        ? "Ready"
        : flow === "recording"
          ? "Recording"
          : flow === "paused"
            ? "Paused"
            : "Busy";

  if (pathname === "/float") {
    return (
      <div className="talkai-app talkai-app--float min-h-0 bg-transparent text-foreground">
        <ThemeRoot />
        {children}
      </div>
    );
  }

  if (isAuthRoute) {
    return (
      <div className="talkai-app talkai-app--auth min-h-dvh bg-background text-foreground">
        <AuthTheme />
        {children}
      </div>
    );
  }

  if (authEnabled && isPending) {
    return <BlankGate />;
  }

  if (authEnabled && !user) {
    return (
      <div className="talkai-app talkai-app--auth min-h-dvh bg-background text-foreground">
        <ThemeRoot />
        <RedirectToSignIn />
      </div>
    );
  }

  if (!user) {
    return <BlankGate />;
  }

  if (!user.isGuest && (!sessionReady || !hydrated)) {
    return <BlankGate />;
  }

  if (!user.isGuest && lockEnabled && !unlocked) {
    return (
      <div className="talkai-app talkai-app--locked min-h-dvh bg-background text-foreground">
        <ThemeRoot />
        <LockScreen />
      </div>
    );
  }

  const toastTheme = luminance(settings.theme.background) < 0.45 ? "dark" : "light";

  return (
    <div
      id="talkai-app"
      className="talkai-app flex min-h-dvh flex-col bg-background text-foreground"
    >
      <ThemeRoot />
      <header
        id="talkai-app-header"
        className="talkai-app-header sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/80 bg-background px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-6"
      >
        <Link
          to="/"
          preload="intent"
          className="talkai-app-header__brand flex min-w-0 items-center gap-2.5"
        >
          <BrandMark size="sm" />
          <span className="font-display text-[1.05rem] leading-none tracking-tight sm:text-xl">
            {APP_NAME}
          </span>
        </Link>
        <div className="talkai-app-header__status flex items-center gap-3 text-xs text-muted-foreground">
          <span className="hidden items-center gap-1.5 sm:flex">
            <Keyboard className="size-3.5" />
            {hydrated ? displayShortcut(settings.shortcut, mac) : "Shortcut"}
          </span>
          <button
            type="button"
            onClick={() => {
              if (flow === "idle") void start("menu");
              else if (flow === "recording") pause();
            }}
            className="talkai-recording-status flex h-11 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                flow === "recording"
                  ? "bg-live led-live"
                  : flow === "paused"
                    ? "bg-primary"
                    : flow === "idle"
                      ? "bg-ready"
                      : "bg-primary",
              )}
            />
            {readyLabel}
          </button>
          {authEnabled ? <UserButton /> : null}
        </div>
      </header>

      <div className="talkai-app-layout mx-auto flex min-h-0 w-full max-w-6xl flex-1 gap-0 md:gap-8 md:px-6">
        <nav
          id="talkai-primary-navigation"
          className="talkai-navigation talkai-navigation--desktop hidden w-48 shrink-0 flex-col gap-1 py-6 md:flex"
        >
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.to === "/" ? libraryActive : pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                preload="intent"
                className={cn(
                  "flex h-11 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                  active
                    ? "is-active bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
          <Link
            to="/diagnostics"
            preload="intent"
            className="mt-auto flex h-11 items-center gap-2.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
          >
            Diagnostics
          </Link>
        </nav>
        <main
          id="talkai-main-content"
          className={cn(
            "talkai-main min-w-0 flex-1 px-4 py-5 pb-28 md:px-0 md:py-6",
            libraryActive ? "md:pb-44" : "md:pb-6",
          )}
        >
          {children}
        </main>
      </div>

      {libraryActive ? (
        <div className="talkai-recorder-dock pointer-events-none fixed inset-x-0 bottom-8 z-20 hidden justify-center md:flex">
          <div className="talkai-recorder-dock__content pointer-events-auto flex flex-col items-center gap-2">
            {hydrated ? (
              <p className="text-center text-xs text-muted-foreground">
                {settings.cleanupEnabled ? `Cleanup · ${defaultPromptName}` : "Cleanup off"}
              </p>
            ) : null}
            <PttButton />
          </div>
        </div>
      ) : null}

      <nav
        id="talkai-mobile-navigation"
        className="talkai-navigation talkai-navigation--mobile fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-background/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-sm md:hidden"
      >
        <ul className="talkai-navigation__list grid grid-cols-5 items-end">
          <NavItem to="/" label="Library" icon={FolderOpen} active={libraryActive} />
          <NavItem to="/prompts" label="Prompts" icon={Sparkles} active={pathname === "/prompts"} />
          <li className="flex justify-center">
            <div className="-mt-5">
              <PttButton dock />
            </div>
          </li>
          <NavItem to="/pad" label="Pad" icon={NotebookPen} active={pathname === "/pad"} />
          <NavItem
            to="/settings"
            label="Settings"
            icon={Settings2}
            active={pathname === "/settings"}
          />
        </ul>
      </nav>

      <RecordingOverlay />
      <Toaster
        theme={toastTheme}
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--color-card)",
            color: "var(--color-foreground)",
            border: "1px solid var(--color-border)",
          },
        }}
      />
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: "/" | "/prompts" | "/pad" | "/settings";
  label: string;
  icon: typeof FolderOpen;
  active: boolean;
}) {
  return (
    <li>
      <Link
        to={to}
        preload="intent"
        className={cn(
          "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
          active ? "is-active text-foreground" : "text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
        {label}
      </Link>
    </li>
  );
}
