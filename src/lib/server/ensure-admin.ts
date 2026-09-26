import { ADMIN_EMAIL } from "@/lib/admin";
import { getSql } from "@/lib/db";

const ADMIN_NAME = process.env.TALKAI_ADMIN_NAME?.trim() || "Administrator";

const globalRef = globalThis as typeof globalThis & {
  __walkieAdminEnsured__?: Promise<void>;
};

async function seed() {
  const adminPassword = process.env.TALKAI_ADMIN_PASSWORD?.trim();
  // Without an explicit bootstrap password, leave the owner email available
  // for normal account creation instead of reserving an unusable user row.
  if (!adminPassword) return;
  if (!ADMIN_EMAIL) {
    throw new Error("Set TALKAI_ADMIN_EMAIL before using TALKAI_ADMIN_PASSWORD.");
  }
  if (adminPassword.length < 8) {
    throw new Error("TALKAI_ADMIN_PASSWORD must contain at least 8 characters.");
  }

  const { randomBytes } = await import("node:crypto");
  const sql = await getSql();
  const existing = await sql.query<{ id: string }>(
    `select id from "user" where lower(email) = lower($1) limit 1`,
    [ADMIN_EMAIL],
  );
  let userId = existing[0]?.id;
  if (!userId) {
    userId = randomBytes(16).toString("hex");
    await sql.query(
      `insert into "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
       values ($1, $2, $3, true, null, now(), now())`,
      [userId, ADMIN_NAME, ADMIN_EMAIL],
    );
  } else {
    await sql.query(
      `update "user" set "emailVerified" = true, name = coalesce(nullif(name, ''), $2), "updatedAt" = now() where id = $1`,
      [userId, ADMIN_NAME],
    );
  }

  const { hashPassword } = await import("better-auth/crypto");
  const hash = await hashPassword(adminPassword);
  const acct = await sql.query<{ id: string }>(
    `select id from account where "userId" = $1 and "providerId" = 'credential' limit 1`,
    [userId],
  );
  if (acct[0]) {
    await sql.query(`update account set password = $2, "updatedAt" = now() where id = $1`, [acct[0].id, hash]);
  } else {
    const id = randomBytes(16).toString("hex");
    await sql.query(
      `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values ($1, $2, 'credential', $3, $4, now(), now())`,
      [id, userId, userId, hash],
    );
  }
}

export function ensureAdminUser(): Promise<void> {
  globalRef.__walkieAdminEnsured__ ??= seed().catch((err) => {
    globalRef.__walkieAdminEnsured__ = undefined;
    console.error("[auth] could not seed owner account", err);
    throw err;
  });
  return globalRef.__walkieAdminEnsured__;
}
