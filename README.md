# Talk AI Web App

Maintained by [aipieksel](https://github.com/aipieksel).

A React/TanStack Start **website** for recording and transcribing speech, organizing a private text library, running reusable prompts, and managing AI provider settings. It includes email/password sign-in, per-user encrypted vaults, and optional local app locking. There is no Electron or Mac app wrapper.

## Local setup

Use Node.js 22.19+ and npm. From this folder:

```sh
npm ci
cp .env.example .env
# Fill in the server secrets and your owner email before starting.
npm run dev
```

Open `http://localhost:8080`. Generate independent values for `BETTER_AUTH_SECRET`, `PROVIDER_CREDENTIAL_SECRET`, and `TALKAI_VAULT_KEY` with `openssl rand -hex 32`. `TALKAI_VAULT_KEY` is preferred for vault encryption; if it is unset, Talk AI uses `BETTER_AUTH_SECRET`. The process fails closed when neither is set. Set `TALKAI_ADMIN_EMAIL` to the account allowed to manage shared transcription and provider settings. No email configured means no administrator. Sign up with that email, or optionally set `TALKAI_ADMIN_PASSWORD` for local bootstrap. Other accounts retain their own vault and personal settings. The existing guest option works only with device-local data and grants no owner or server-vault access.

Set `TALKAI_DATA_DIR` to a private writable directory for persistent local PGlite storage. Without it, the embedded database is in memory and resets when the process exits. `DATABASE_URL` selects PostgreSQL instead. Keep the credential encryption secret stable when retaining stored credentials.

Google/X sign-in needs your own compatible Grok broker configuration; no broker secret is included. Email/password works independently. Transcription and AI operations need a configured provider or the supported local tools. See [authentication](docs/authentication-and-access.md) and [providers/models](docs/providers-and-models.md).

## Commands

```sh
npm test
npm run typecheck
npm run check:auth
npm run build
npm run preview
```

`build` also runs database migrations. Use a disposable local database when verifying a new checkout. `preview` serves the built app. `setup.sh` installs website dependencies only.

## Source map

- `src/routes/`: login, library, prompt, settings, pad and auth routes.
- `src/lib/auth/`: Better Auth session and route protection.
- `src/lib/server/`: vault, providers, transcription, owner configuration and local integration.
- `scripts/`: environment wrapper, migration, local helpers and tests.
- `public/` and `server/`: static assets and Grok host integration.

## Privacy and project status

Account databases, recordings, vaults, provider keys, local model files, launcher state, and deployment credentials are not starter content. Keep them outside source or in ignored private locations. AI/transcription calls send selected content to the provider you configure. The repository contains a working website under development; hosted federation and local transcription binaries depend on your environment.

Vault records are encrypted per user with a key derived from `TALKAI_VAULT_KEY`, or from `BETTER_AUTH_SECRET` when the dedicated vault key is unset. Provider keys such as `XAI_API_KEY` are never used for vault derivation. Missing both secrets is a startup/request error, not a fallback to a built-in value. Changing the derivation input makes existing vault rows unreadable; start a new local database if you are moving off an older development fallback.

The owner-original source is licensed under [MIT](LICENSE). Preserve third-party dependency notices.
