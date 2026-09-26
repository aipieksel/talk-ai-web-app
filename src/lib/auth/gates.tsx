import { useState, type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authEnabled, signOut } from "./client";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";
import { useGuest } from "@/lib/guest";

export const SIGN_IN_PATH = "/login";

export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} replace />;
}

export function UserButton() {
  const user = useCurrentUser();
  const leaveGuest = useGuest((s) => s.leave);
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img src={user.profileImageUrl} alt="" className="size-8 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-medium shadow-border">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="hidden max-w-[7.5rem] truncate text-sm font-medium sm:inline">{label}</span>
      {authEnabled ? (
        <Button
          type="button"
          variant="default"
          size="default"
          disabled={signingOut}
          className="h-11 shrink-0 gap-2 rounded-xl px-4 font-semibold"
          onClick={() => {
            setSigningOut(true);
            if (user.isGuest) {
              void leaveGuest().then(() => window.location.assign("/login"));
              return;
            }
            void signOut().catch(() => setSigningOut(false));
          }}
        >
          <LogOut className="size-4" />
          <span>{signingOut ? "Signing out…" : user.isGuest ? "Leave guest" : "Sign out"}</span>
        </Button>
      ) : null}
    </div>
  );
}
