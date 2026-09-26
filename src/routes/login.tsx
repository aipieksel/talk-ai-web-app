import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { startPasswordReset } from "@/lib/server/account";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { resetBrowserAccountState } from "@/lib/account";
import { useGuest } from "@/lib/guest";
import { APP_BLURB, APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";
import { GoogleIcon, XIcon } from "@/components/brand-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/stores/app";
import { desktop, isDesktop } from "@/lib/desktop";
import { clearLocalTrustToken } from "@/lib/auth/local-trust";

export const Route = createFileRoute("/login")({ ssr: false, component: Login });

type Step = "start" | "password" | "signup" | "forgot";

function Login() {
  const { user, isPending } = useCurrentUserState();
  const enterGuest = useGuest((s) => s.enter);
  const [step, setStep] = useState<Step>("start");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [trustDesktop, setTrustDesktop] = useState(() => isDesktop());
  const [unlocking, setUnlocking] = useState(() => isDesktop());
  const autoLoginAttempted = useRef(false);

  useEffect(() => {
    if (isPending || user || autoLoginAttempted.current) return;
    const bridge = desktop();
    if (!bridge) {
      setUnlocking(false);
      return;
    }
    autoLoginAttempted.current = true;
    void (async () => {
      try {
        const saved = await bridge.getSavedLogin();
        if (!saved) {
          setUnlocking(false);
          return;
        }
        setEmail(saved.email);
        const result = await authClient.signIn.email(saved);
        if (result.error) {
          await bridge.clearSavedLogin();
          setStep("password");
          setError(
            "The saved login is no longer valid. Enter your password to trust this desktop again.",
          );
          setUnlocking(false);
          return;
        }
        window.location.assign("/");
      } catch {
        setError("Talk AI could not unlock the saved login. You can still sign in normally.");
        setUnlocking(false);
      }
    })();
  }, [isPending, user]);

  useEffect(() => {
    if (isPending || user) return;
    resetBrowserAccountState();
    useApp.getState().resetAccount();
  }, [isPending, user]);

  if (!isPending && user) return <Navigate to="/" />;

  const goStart = () => {
    setStep("start");
    setPassword("");
    setShowPassword(false);
    setError("");
    setNotice("");
  };

  const continueEmail = () => {
    const value = email.trim();
    if (!value || !value.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    setError("");
    setStep("password");
  };

  const submitPassword = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      clearLocalTrustToken();
      if (step === "forgot") {
        await startPasswordReset({
          data: { email: email.trim(), origin: window.location.origin },
        });
        setNotice("If that email has a password here, a reset was created.");
        setBusy(false);
        return;
      }
      if (step === "signup") {
        const result = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || email.trim(),
        });
        if (result.error) throw new Error(result.error.message || "Could not create account");
      } else {
        const result = await authClient.signIn.email({ email: email.trim(), password });
        if (result.error) throw new Error(result.error.message || "Could not sign in");
      }
      if (trustDesktop && desktop()) {
        await desktop()?.saveLogin(email.trim(), password);
      }
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
      setBusy(false);
    }
  };

  const field = "h-11 rounded-xl";
  const action = "h-11 w-full rounded-xl text-[15px]";

  return (
    <div
      id="talkai-login-page"
      className="talkai-page talkai-login-page flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground"
    >
      <div className="talkai-login-page__header mb-6 flex w-full max-w-[22rem] flex-col items-center text-center">
        <BrandMark size="lg" />
        <h1 className="mt-4 font-display text-[1.85rem] leading-none tracking-tight">{APP_NAME}</h1>
        <p className="mt-2 text-[15px] font-medium tracking-tight text-foreground">{APP_TAGLINE}</p>
        <p className="mt-1.5 max-w-[18rem] text-sm leading-snug text-muted-foreground">
          {APP_BLURB}
        </p>
      </div>

      <div
        id="talkai-login-panel"
        className="talkai-auth-panel w-full max-w-[22rem] rounded-xl bg-card px-4 py-5 shadow-border sm:px-5"
      >
        {authEnabled && unlocking ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
            <ShieldCheck className="size-6 text-primary" />
            <div>
              <p className="text-sm font-medium">Unlocking this desktop…</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Signing in to your saved account.
              </p>
            </div>
          </div>
        ) : authEnabled ? (
          step === "start" ? (
            <div className="talkai-auth-options space-y-2.5">
              {GROK_PROVIDERS.map((p) => (
                <Button
                  key={p.providerId}
                  type="button"
                  variant="secondary"
                  className={`${action} justify-center gap-2.5`}
                  onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
                >
                  {p.idp === "google" ? (
                    <GoogleIcon className="size-5 shrink-0" />
                  ) : (
                    <XIcon className="size-4 shrink-0" />
                  )}
                  Continue with {p.label}
                </Button>
              ))}

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/80" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    or
                  </span>
                </div>
              </div>

              <Input
                id="talkai-login-email"
                className={field}
                placeholder="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") continueEmail();
                }}
              />
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <Button className={action} disabled={!email.trim()} onClick={continueEmail}>
                Continue
              </Button>
              <button
                type="button"
                className="flex h-11 w-full items-center justify-center rounded-xl text-sm text-muted-foreground hover:text-foreground"
                onClick={() => enterGuest()}
              >
                Continue without an account
              </button>
              <p className="text-center text-[11px] leading-snug text-subtle">
                Guest mode stays on this device only. Nothing is saved to your account.
              </p>
            </div>
          ) : (
            <div className="talkai-auth-credentials space-y-2.5">
              <button
                type="button"
                onClick={goStart}
                className="-ml-1 mb-1 flex h-9 items-center gap-1.5 rounded-xl px-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                Back
              </button>

              <p className="truncate text-sm text-muted-foreground">{email.trim()}</p>

              {step === "signup" ? (
                <Input
                  id="talkai-login-name"
                  className={field}
                  placeholder="Name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              ) : null}

              {step !== "forgot" ? (
                <div className="relative">
                  <Input
                    id="talkai-login-password"
                    className={`${field} pr-12`}
                    placeholder="Password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={step === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && password.length >= 8) void submitPassword();
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  We’ll prepare a password reset for this email if an account exists.
                </p>
              )}

              {step !== "forgot" && isDesktop() ? (
                <label className="flex min-h-11 items-start gap-3 rounded-xl bg-secondary px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={trustDesktop}
                    onChange={(event) => setTrustDesktop(event.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Trust this desktop</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      Use encrypted macOS storage to sign in automatically on this Mac.
                    </span>
                  </span>
                </label>
              ) : null}

              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}

              <Button
                className={action}
                disabled={busy || (step !== "forgot" && password.length < 8)}
                onClick={() => void submitPassword()}
              >
                {busy
                  ? "Please wait…"
                  : step === "signup"
                    ? "Create account"
                    : step === "forgot"
                      ? "Send reset"
                      : "Sign in"}
              </Button>

              <div className="flex items-center justify-between gap-2 pt-0.5 text-xs text-muted-foreground">
                {step === "password" ? (
                  <>
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => {
                        setStep("forgot");
                        setError("");
                        setNotice("");
                      }}
                    >
                      Forgot password?
                    </button>
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => {
                        setStep("signup");
                        setError("");
                        setNotice("");
                      }}
                    >
                      Create account
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => {
                      setStep("password");
                      setError("");
                      setNotice("");
                    }}
                  >
                    Sign in instead
                  </button>
                )}
              </div>
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Sign-in is disabled.</p>
        )}
      </div>
    </div>
  );
}
