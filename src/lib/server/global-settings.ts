import { createServerFn } from "@tanstack/react-start";
import { ADMIN_EMAIL, isAdminEmail, pickGlobalSettings, type GlobalSettingKey } from "@/lib/admin";
import { authMiddleware, optionalAuthMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { AppSettings } from "@/lib/types";
import { ensureAdminUser } from "./ensure-admin";

export type GlobalSettings = Partial<Pick<AppSettings, GlobalSettingKey>>;

async function ensureGlobalSchema() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists app_global (
      id text primary key,
      settings jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    insert into app_global (id, settings)
    values ('default', '{}'::jsonb)
    on conflict (id) do nothing
  `);
  await sql.query(`
    create table if not exists password_reset_outbox (
      id text primary key,
      email text not null,
      url text not null,
      created_at timestamptz not null default now(),
      consumed_at timestamptz
    )
  `);
}

export async function readGlobalSettings(): Promise<GlobalSettings> {
  await ensureAdminUser();
  await ensureGlobalSchema();
  const sql = await getSql();
  const rows = await sql.query<{ settings: GlobalSettings | string }>(
    `select settings from app_global where id = 'default' limit 1`,
  );
  const raw = rows[0]?.settings;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as GlobalSettings;
    } catch {
      return {};
    }
  }
  return raw ?? {};
}

export async function writeGlobalSettings(settings: AppSettings): Promise<void> {
  const slim = pickGlobalSettings(settings as unknown as Record<string, unknown>);
  await ensureGlobalSchema();
  const sql = await getSql();
  await sql.query(
    `insert into app_global (id, settings, updated_at)
     values ('default', $1::jsonb, now())
     on conflict (id) do update set settings = excluded.settings, updated_at = now()`,
    [JSON.stringify(slim)],
  );
}

export async function emailForUser(userId: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql.query<{ email: string }>(`select email from "user" where id = $1 limit 1`, [userId]);
  return rows[0]?.email ?? null;
}

export async function assertAdmin(userId: string): Promise<void> {
  const email = await emailForUser(userId);
  if (!isAdminEmail(email)) {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}

export const loadGlobalSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const settings = await readGlobalSettings();
    return { ok: true as const, settings };
  });

export const saveGlobalSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { settings: AppSettings }) => input)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    await writeGlobalSettings(data.settings);
    return { ok: true as const };
  });

export const loadPublicGlobals = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .handler(async () => {
    const settings = await readGlobalSettings();
    return {
      ok: true as const,
      settings: {
        transcribeEngine: settings.transcribeEngine,
        whisperModel: settings.whisperModel,
        cleanupEnabled: true as const,
        provider: settings.provider,
        model: settings.model,
      },
    };
  });

