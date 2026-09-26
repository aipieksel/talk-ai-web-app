import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic } from "lucide-react";
import { useMemo, useState } from "react";
import { completePasswordReset } from "@/lib/server/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeRoot } from "@/components/theme-root";

export const Route = createFileRoute("/reset-password")({ ssr: false, component: ResetPassword });

function ResetPassword() {
  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") ?? "";
  }, []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!token) {
      setError("This reset link is missing a token.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await completePasswordReset({ data: { token, password } });
      if (!result.ok) throw new Error(result.error || "Could not reset password");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      id="talkai-reset-password-page"
      className="talkai-page talkai-reset-password-page flex min-h-dvh flex-col items-center justify-center bg-background px-5 text-foreground"
    >
      <ThemeRoot />
      <div
        id="talkai-reset-password-panel"
        className="talkai-auth-panel w-full max-w-sm rounded-xl bg-card p-6 shadow-lift"
      >
        <div className="talkai-auth-panel__header mb-6 flex flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-secondary shadow-border">
            <Mic className="size-5 text-primary" />
          </span>
          <h1 className="font-display text-3xl tracking-tight">New password</h1>
        </div>
        {done ? (
          <div className="talkai-auth-panel__success space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              Your password is updated. Sign in with it.
            </p>
            <Button className="w-full" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        ) : (
          <div className="talkai-auth-panel__form space-y-3">
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              className="w-full"
              disabled={busy || password.length < 8}
              onClick={() => void submit()}
            >
              {busy ? "Please wait…" : "Save password"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
