import { createServerFn } from "@tanstack/react-start";
import { isAdminEmail } from "@/lib/admin";
import { authMiddleware } from "@/lib/auth/middleware";

export const getAccountProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensureAdminUser } = await import("./ensure-admin");
    const { getSql } = await import("@/lib/db");
    await ensureAdminUser();
    const sql = await getSql();
    const users = await sql.query<{ name: string; email: string; image: string | null }>(
      `select name, email, image from "user" where id = $1 limit 1`,
      [context.userId],
    );
    const user = users[0];
    const accounts = await sql.query<{ providerId: string }>(
      `select "providerId" from account where "userId" = $1`,
      [context.userId],
    );
    const providers = accounts.map((a) => a.providerId);
    return {
      ok: true as const,
      name: user?.name ?? "",
      email: user?.email ?? "",
      image: user?.image ?? null,
      hasPassword: providers.includes("credential"),
      providers,
      isAdmin: isAdminEmail(user?.email),
    };
  });

export const changeAccountPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { current: string; next: string }) => input)
  .handler(async ({ context, data }) => {
    if (!data.next || data.next.length < 8) return { ok: false as const, error: "New password must be at least 8 characters." };
    const { getSql } = await import("@/lib/db");
    const { hashPassword, verifyPassword } = await import("better-auth/crypto");
    const sql = await getSql();
    const rows = await sql.query<{ id: string; password: string | null }>(
      `select id, password from account where "userId" = $1 and "providerId" = 'credential' limit 1`,
      [context.userId],
    );
    const row = rows[0];
    if (!row?.password) {
      return { ok: false as const, error: "This account signs in with Google. There is no password to change." };
    }
    const ok = await verifyPassword({ hash: row.password, password: data.current });
    if (!ok) return { ok: false as const, error: "Current password is wrong." };
    const hash = await hashPassword(data.next);
    await sql.query(`update account set password = $2, "updatedAt" = now() where id = $1`, [row.id, hash]);
    return { ok: true as const };
  });

export async function recordPasswordReset(email: string, url: string) {
  const { randomBytes } = await import("node:crypto");
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql.query(`
    create table if not exists password_reset_outbox (
      id text primary key,
      email text not null,
      url text not null,
      created_at timestamptz not null default now(),
      consumed_at timestamptz
    )
  `);
  await sql.query(
    `insert into password_reset_outbox (id, email, url, created_at)
     values ($1, $2, $3, now())`,
    [randomBytes(16).toString("hex"), email.toLowerCase(), url],
  );
}

export const listPasswordResets = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { emailForUser } = await import("./global-settings");
    const { getSql } = await import("@/lib/db");
    const email = await emailForUser(context.userId);
    if (!isAdminEmail(email)) return { ok: true as const, items: [] as { id: string; email: string; url: string; createdAt: string }[] };
    const sql = await getSql();
    const rows = await sql.query<{ id: string; email: string; url: string; created_at: string }>(
      `select id, email, url, created_at::text as created_at
       from password_reset_outbox
       where consumed_at is null
       order by created_at desc
       limit 20`,
    );
    return {
      ok: true as const,
      items: rows.map((r) => ({ id: r.id, email: r.email, url: r.url, createdAt: r.created_at })),
    };
  });

export const consumePasswordReset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const { emailForUser } = await import("./global-settings");
    const { getSql } = await import("@/lib/db");
    const email = await emailForUser(context.userId);
    if (!isAdminEmail(email)) return { ok: false as const };
    const sql = await getSql();
    await sql.query(`update password_reset_outbox set consumed_at = now() where id = $1`, [data.id]);
    return { ok: true as const };
  });

export const startPasswordReset = createServerFn({ method: "POST" })
  .validator((input: { email: string; origin: string }) => input)
  .handler(async ({ data }) => {
    const { randomBytes } = await import("node:crypto");
    const { ensureAdminUser } = await import("./ensure-admin");
    const { getSql } = await import("@/lib/db");
    await ensureAdminUser();
    const email = data.email.trim().toLowerCase();
    if (!email) return { ok: true as const };
    const sql = await getSql();
    await sql.query(`
      create table if not exists password_reset_outbox (
        id text primary key,
        email text not null,
        url text not null,
        created_at timestamptz not null default now(),
        consumed_at timestamptz
      )
    `);
    const users = await sql.query<{ id: string }>(
      `select id from "user" where lower(email) = $1 limit 1`,
      [email],
    );
    const userId = users[0]?.id;
    if (!userId) return { ok: true as const };
    const cred = await sql.query<{ id: string }>(
      `select id from account where "userId" = $1 and "providerId" = 'credential' limit 1`,
      [userId],
    );
    if (!cred[0]) return { ok: true as const };
    const token = randomBytes(24).toString("hex");
    const origin = data.origin.replace(/\/+$/, "");
    const url = `${origin}/reset-password?token=${token}`;
    await sql.query(
      `insert into password_reset_outbox (id, email, url, created_at)
       values ($1, $2, $3, now())`,
      [token, email, url],
    );
    return { ok: true as const };
  });

export const completePasswordReset = createServerFn({ method: "POST" })
  .validator((input: { token: string; password: string }) => input)
  .handler(async ({ data }) => {
    if (!data.password || data.password.length < 8) {
      return { ok: false as const, error: "Password must be at least 8 characters." };
    }
    const { getSql } = await import("@/lib/db");
    const { hashPassword } = await import("better-auth/crypto");
    const sql = await getSql();
    const rows = await sql.query<{ id: string; email: string }>(
      `select id, email from password_reset_outbox
       where id = $1 and consumed_at is null
         and created_at > now() - interval '2 hours'
       limit 1`,
      [data.token],
    );
    const row = rows[0];
    if (!row) return { ok: false as const, error: "This reset link is invalid or expired." };
    const users = await sql.query<{ id: string }>(
      `select id from "user" where lower(email) = $1 limit 1`,
      [row.email],
    );
    const userId = users[0]?.id;
    if (!userId) return { ok: false as const, error: "This reset link is invalid or expired." };
    const hash = await hashPassword(data.password);
    await sql.query(
      `update account set password = $2, "updatedAt" = now()
       where "userId" = $1 and "providerId" = 'credential'`,
      [userId, hash],
    );
    await sql.query(`update password_reset_outbox set consumed_at = now() where id = $1`, [row.id]);
    return { ok: true as const };
  });
