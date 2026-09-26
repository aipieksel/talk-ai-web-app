# Authentication, login, settings access & data isolation

This document describes how Talk AI decides who can enter the app, what they
can see, and how their data is protected. It reflects the **current code**.

---

## 1. Two layers of protection

Talk AI uses two independent gates. Account-backed use passes these gates before the main UI
(library, prompts, pad, settings) is painted. The existing **Continue without an account** option creates a device-local guest session; guests do not receive server vault or owner privileges.

| Layer                          | What it is                                         | Where it lives                                | Who controls it                      |
| ------------------------------ | -------------------------------------------------- | --------------------------------------------- | ------------------------------------ |
| **1. Account auth**            | Better Auth session (Google, X, or email/password) | `/api/auth/*`, `src/lib/auth/*`               | Any visitor who can complete sign-in |
| **2. App lock (optional PIN)** | Extra username + password gate                     | `src/lib/server/lock.ts`, Settings → Security | The signed-in user who enables it    |

### Layer 1 — Account auth (required)

- Sign-in is **on**. Session enforcement stays enabled without federation credentials; only the optional Google/X plugin depends on broker configuration.
- Supported methods: **email + password**, plus **Google/X** when a compatible OAuth broker is configured.
- The login route offers sign-in or an explicit device-local guest mode. Account data and server operations still require a verified account session.

### Layer 2 — App lock (optional)

- Configured under **Settings → Security → Extra PIN**.
- When enabled, even a valid account session is not enough: the lock screen
  appears until the correct username/password is entered.

---

## 2. Login flow

Route: `/login`.

1. Brand (name, tagline, blurb) sits **outside** the card so it never jumps.
2. **Start step** — Continue with Google / Continue with X, then email + Continue.
3. **Password step** — password, sign in / create account / forgot password.
4. On success the app goes to `/` and starts vault sync for that user.

---

## 3. Who can access Settings

**Any user who has passed Layer 1 (and Layer 2 if enabled).**

Transcription, AI-provider, and desktop configuration tabs are restricted to
the owner account. Other authenticated users retain their personal appearance,
voice, sound, completion, permission, and account settings.

The owner email comes from server-only `TALKAI_ADMIN_EMAIL`; `TALKAI_ADMIN_NAME` optionally names a bootstrapped owner. An empty owner email grants no administrator access. The Better Auth session exposes only the derived `isAdmin` flag to the client; server functions also enforce the owner check. An optional local
email/password bootstrap must be supplied through `TALKAI_ADMIN_PASSWORD`; no
owner password is stored in source. Hosted environments should prefer the
configured Google or X identity provider and leave the bootstrap variable unset.

---

## 4. Route & chrome gating

`AppShell` is the single gate:

1. `/login` and `/reset-password` → pure auth UI, zero app chrome.
2. Auth still resolving → solid blank.
3. Definitely signed out → blank + redirect to `/login`.
4. Signed in but vault/session not ready → blank.
5. App lock enabled and locked → lock screen only.
6. Fully ready → full shell.

---

## 5. Data isolation

- Library, prompts, folders, pad, and settings live in an AES-256-GCM vault
  keyed by `userId`.
- Server functions that touch user data use `authMiddleware`.
- On sign-out, local data is wiped.
- Only `/api/auth/*` is a conventional public HTTP route.

`src/lib/server/vault.ts` derives each encryption key from the user ID and
`TALKAI_VAULT_KEY`, or `BETTER_AUTH_SECRET` when the dedicated vault key is
unset. The process fails closed if neither secret is set. `XAI_API_KEY` and
other provider credentials are not vault keys. Preserve the derivation input
with persistent data, since changing it can prevent old vaults from being
decrypted. Older development vaults that used a built-in fallback cannot be
opened; use a new local database.

### Trusted local PWA

When `TALKAI_LOCAL_MODE=1` and Talk AI is opened through a loopback address,
an already signed-in user can enable **Skip login on this Mac** under
Settings → Security. Talk AI stores the current Better Auth session token in
that local origin; it never stores the account password. The same email
account, encrypted vault, library, prompts, and settings remain active.

Signing out, starting a new sign-in, or choosing **Require login on this Mac**
removes the trusted token. The control is unavailable on non-loopback hosts and
the server refuses to issue trusted tokens outside explicit local mode.

---

## 6. What is not implemented

- No multi-tenant admin console.
- No general-purpose role or permission table; the current owner check is a
  single administrative-email contract.
