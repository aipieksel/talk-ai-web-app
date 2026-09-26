import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { APP_NAME } from "@/lib/brand";
import { useSession } from "@/stores/session";

export function LockScreen() {
  const login = useSession((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await login(username.trim(), password, remember);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Could not sign in.");
      setPassword("");
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 text-foreground">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm rounded-xl bg-card p-6 shadow-border"
        autoComplete="on"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandMark size="lg" />
          <div>
            <h1 className="font-display text-3xl tracking-tight">{APP_NAME}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue.</p>
          </div>
        </div>
        <div className="space-y-3">
          <Field label="Username">
            <Input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Password">
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 accent-[var(--color-primary)]"
            />
            Remember me on this device
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy || !username || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>
    </div>
  );
}
