import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";

const COOKIE = "wk";
const ITERATIONS = 210_000;
const MAX_FAILS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;
const GENERIC = "Sign in required.";
const BAD_LOGIN = "Could not sign in.";

type LockRow = {
  id: string;
  enabled: boolean;
  username: string;
  salt: string;
  hash: string;
  iterations: number;
  session_hours: number;
};

const attempts = (globalThis as typeof globalThis & {
  __walkieFails__?: Map<string, { fails: number; lockedUntil: number }>;
}).__walkieFails__ ?? new Map<string, { fails: number; lockedUntil: number }>();
(globalThis as typeof globalThis & { __walkieFails__?: typeof attempts }).__walkieFails__ = attempts;

function asBool(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1 || v === "1";
}

async function crypto() {
  return import("node:crypto");
}

async function hashToken(token: string): Promise<string> {
  const { createHash } = await crypto();
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string, saltHex: string, iterations: number): Promise<string> {
  const { pbkdf2Sync } = await crypto();
  const salt = Buffer.from(saltHex, "hex");
  return pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
}

async function safeEqualHex(a: string, b: string): Promise<boolean> {
  try {
    const { timingSafeEqual } = await crypto();
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function validUsername(v: string): boolean {
  return /^[a-zA-Z0-9_]{3,32}$/.test(v);
}

function validPassword(v: string): boolean {
  return v.length >= 8 && v.length <= 200;
}

function memoryLock(): LockRow | null {
  return (globalThis as typeof globalThis & { __walkieLock__?: LockRow | null }).__walkieLock__ ?? null;
}

function setMemoryLock(row: LockRow | null) {
  (globalThis as typeof globalThis & { __walkieLock__?: LockRow | null }).__walkieLock__ = row;
}

function memorySessions(): Map<string, number> {
  const g = globalThis as typeof globalThis & { __walkieSessions__?: Map<string, number> };
  g.__walkieSessions__ ??= new Map();
  return g.__walkieSessions__;
}

async function sql() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { getSql } = await import("@/lib/db");
    return await getSql();
  } catch {
    return null;
  }
}

async function writeFileLock(row: LockRow | null) {
  try {
    const { mkdirSync, writeFileSync, unlinkSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "data");
    const p = join(dir, "lock.json");
    if (!row || !row.enabled) {
      if (existsSync(p)) unlinkSync(p);
      return;
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      p,
      JSON.stringify({
        enabled: row.enabled,
        username: row.username,
        salt: row.salt,
        hash: row.hash,
        iterations: row.iterations,
        session_hours: row.session_hours,
      }),
    );
  } catch {
    /* read-only filesystem */
  }
}

async function fileLock(): Promise<LockRow | null> {
  try {
    const { existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const p = join(process.cwd(), "data", "lock.json");
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<LockRow>;
    if (!raw.username || !raw.salt || !raw.hash) return null;
    return {
      id: "default",
      enabled: raw.enabled !== false,
      username: String(raw.username),
      salt: String(raw.salt),
      hash: String(raw.hash),
      iterations: Number(raw.iterations) || ITERATIONS,
      session_hours: Number(raw.session_hours) || 168,
    };
  } catch {
    return null;
  }
}

async function loadLock(): Promise<LockRow | null> {
  const cached = memoryLock();
  if (cached) return cached;
  const fromFile = await fileLock();
  if (fromFile) {
    setMemoryLock(fromFile);
    return fromFile;
  }
  const db = await sql();
  if (!db) return null;
  try {
    const rows = await db<LockRow>`select id, enabled, username, salt, hash, iterations, session_hours from app_lock where id = ${"default"} limit 1`;
    const row = rows[0];
    if (row) {
      const next = {
        ...row,
        enabled: asBool(row.enabled),
        iterations: Number(row.iterations) || ITERATIONS,
        session_hours: Number(row.session_hours) || 168,
      };
      setMemoryLock(next);
      return next;
    }
  } catch {
    /* table may not exist yet */
  }
  return null;
}

async function ensureSchema(db: NonNullable<Awaited<ReturnType<typeof sql>>>) {
  await db.query(`
    create table if not exists app_lock (
      id text primary key,
      enabled boolean not null default false,
      username text not null default '',
      salt text not null default '',
      hash text not null default '',
      iterations integer not null default 210000,
      session_hours integer not null default 168,
      updated_at timestamptz not null default now()
    )
  `);
  await db.query(`
    create table if not exists app_sessions (
      token_hash text primary key,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `);
}

async function saveLock(row: Omit<LockRow, "id">): Promise<void> {
  const full: LockRow = { id: "default", ...row };
  setMemoryLock(full);
  await writeFileLock(full.enabled ? full : null);
  const db = await sql();
  if (!db) return;
  await ensureSchema(db);
  await db`
    insert into app_lock (id, enabled, username, salt, hash, iterations, session_hours, updated_at)
    values (${"default"}, ${row.enabled}, ${row.username}, ${row.salt}, ${row.hash}, ${row.iterations}, ${row.session_hours}, now())
    on conflict (id) do update set
      enabled = excluded.enabled,
      username = excluded.username,
      salt = excluded.salt,
      hash = excluded.hash,
      iterations = excluded.iterations,
      session_hours = excluded.session_hours,
      updated_at = now()
  `;
}

const cookies = createServerOnlyFn(() => import("./request-context.server"));

async function clientIp(): Promise<string> {
  try {
    const { getRequestIP } = await cookies();
    return getRequestIP({ xForwardedFor: true }) || "local";
  } catch {
    return "local";
  }
}

async function protocol(): Promise<string> {
  try {
    const { getRequestProtocol } = await cookies();
    return getRequestProtocol() || "http";
  } catch {
    return "http";
  }
}

async function readCookie(): Promise<string> {
  try {
    const { getCookie } = await cookies();
    return getCookie(COOKIE) || "";
  } catch {
    return "";
  }
}

async function writeCookie(token: string, maxAgeSec: number | undefined, secure: boolean) {
  try {
    const { setCookie } = await cookies();
    setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: maxAgeSec,
    });
  } catch {
    /* */
  }
}

async function clearCookie(secure: boolean) {
  try {
    const { deleteCookie } = await cookies();
    deleteCookie(COOKIE, { path: "/", secure, sameSite: "lax" });
  } catch {
    /* */
  }
}

function checkRate(ip: string): string | null {
  const row = attempts.get(ip);
  if (!row) return null;
  if (row.lockedUntil && Date.now() < row.lockedUntil) return BAD_LOGIN;
  return null;
}

function failRate(ip: string) {
  const row = attempts.get(ip) ?? { fails: 0, lockedUntil: 0 };
  row.fails += 1;
  if (row.fails >= MAX_FAILS) {
    row.lockedUntil = Date.now() + LOCKOUT_MS;
    row.fails = 0;
  }
  attempts.set(ip, row);
}

function clearRate(ip: string) {
  attempts.delete(ip);
}

async function sessionValid(token: string): Promise<boolean> {
  if (!token || token.length < 16) return false;
  const digest = await hashToken(token);
  const exp = memorySessions().get(digest);
  if (exp && exp > Date.now()) return true;
  if (exp) memorySessions().delete(digest);
  const db = await sql();
  if (!db) return false;
  try {
    const rows = await db<{ token_hash: string }>`
      select token_hash from app_sessions
      where token_hash = ${digest} and expires_at > now()
      limit 1
    `;
    return Boolean(rows[0]);
  } catch {
    return false;
  }
}

async function createSession(hours: number): Promise<string> {
  const { randomBytes } = await crypto();
  const token = randomBytes(32).toString("hex");
  const digest = await hashToken(token);
  const expiresAt = Date.now() + Math.max(hours, 0.12) * 3600 * 1000;
  memorySessions().set(digest, expiresAt);
  const db = await sql();
  if (!db) return token;
  try {
    await ensureSchema(db);
    await db`delete from app_sessions where expires_at < now()`;
    await db`
      insert into app_sessions (token_hash, expires_at, created_at)
      values (${digest}, ${new Date(expiresAt).toISOString()}, now())
    `;
  } catch {
    /* memory session is enough */
  }
  return token;
}

async function dropSession(token: string) {
  if (!token) return;
  const digest = await hashToken(token);
  memorySessions().delete(digest);
  const db = await sql();
  if (!db) return;
  try {
    await db`delete from app_sessions where token_hash = ${digest}`;
  } catch {
    /* */
  }
}

export async function assertUnlocked(sessionToken?: string): Promise<string | null> {
  const lock = await loadLock();
  if (!lock?.enabled) return null;
  const token = (sessionToken || "").trim() || (await readCookie());
  if (await sessionValid(token)) return null;
  return GENERIC;
}

export const lockStatus = createServerFn({ method: "POST" })
  .validator((input: { sessionToken?: string } = {}) => input ?? {})
  .handler(async ({ data }) => {
    const lock = await loadLock();
    if (!lock?.enabled) {
      return { enabled: false as const, unlocked: true as const, username: "", sessionHours: 168 };
    }
    const token = (data.sessionToken || "").trim() || (await readCookie());
    const unlocked = await sessionValid(token);
    return {
      enabled: true as const,
      unlocked,
      username: unlocked ? lock.username : "",
      sessionHours: lock.session_hours,
    };
  });

export const lockLogin = createServerFn({ method: "POST" })
  .validator((input: { username: string; password: string; remember: boolean }) => input)
  .handler(async ({ data }) => {
    const ip = await clientIp();
    const gated = checkRate(ip);
    if (gated) return { ok: false as const, error: gated };

    const lock = await loadLock();
    if (!lock?.enabled) {
      return { ok: false as const, error: BAD_LOGIN };
    }

    const userOk = data.username.trim() === lock.username;
    const passHash = await hashPassword(data.password, lock.salt, lock.iterations);
    const passOk = await safeEqualHex(passHash, lock.hash);
    if (!userOk || !passOk) {
      failRate(ip);
      return { ok: false as const, error: BAD_LOGIN };
    }
    clearRate(ip);
    const token = await createSession(data.remember ? lock.session_hours : 8);
    const secure = (await protocol()) === "https";
    await writeCookie(token, data.remember ? Math.round(lock.session_hours * 3600) : undefined, secure);
    return { ok: true as const, token, username: lock.username, sessionHours: lock.session_hours };
  });

export const lockLogout = createServerFn({ method: "POST" })
  .validator((input: { sessionToken?: string } = {}) => input ?? {})
  .handler(async ({ data }) => {
    const token = (data.sessionToken || "").trim() || (await readCookie());
    await dropSession(token);
    await clearCookie((await protocol()) === "https");
    return { ok: true as const };
  });

export const lockSetup = createServerFn({ method: "POST" })
  .validator(
    (input: {
      username: string;
      password: string;
      sessionHours: number;
      currentPassword?: string;
      sessionToken?: string;
      enable: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    const existing = await loadLock();
    const token = (data.sessionToken || "").trim() || (await readCookie());

    if (existing?.enabled) {
      const authed = await sessionValid(token);
      const passOk = data.currentPassword
        ? await safeEqualHex(await hashPassword(data.currentPassword, existing.salt, existing.iterations), existing.hash)
        : false;
      if (!authed && !passOk) return { ok: false as const, error: GENERIC };
    }

    if (!data.enable) {
      if (existing) {
        await saveLock({
          enabled: false,
          username: existing.username,
          salt: existing.salt,
          hash: existing.hash,
          iterations: existing.iterations,
          session_hours: existing.session_hours,
        });
      }
      await dropSession(token);
      await clearCookie((await protocol()) === "https");
      return { ok: true as const, enabled: false as const, username: "" };
    }

    const username = data.username.trim();
    if (!validUsername(username)) {
      return { ok: false as const, error: "Username must be 3–32 letters, numbers, or underscores." };
    }
    if (!validPassword(data.password)) {
      return { ok: false as const, error: "Password must be at least 8 characters." };
    }
    if (data.password.toLowerCase() === username.toLowerCase()) {
      return { ok: false as const, error: "Password cannot match the username." };
    }
    const hours = [1, 24, 168, 720].includes(data.sessionHours) ? data.sessionHours : 168;
    const { randomBytes } = await crypto();
    const salt = randomBytes(16).toString("hex");
    const hash = await hashPassword(data.password, salt, ITERATIONS);
    try {
      await saveLock({
        enabled: true,
        username,
        salt,
        hash,
        iterations: ITERATIONS,
        session_hours: hours,
      });
      const session = await createSession(hours);
      const secure = (await protocol()) === "https";
      await writeCookie(session, hours * 3600, secure);
      return { ok: true as const, enabled: true as const, username, token: session, sessionHours: hours };
    } catch {
      return { ok: false as const, error: "Could not enable sign-in." };
    }
  });
