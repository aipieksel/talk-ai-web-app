import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { AppSettings, Folder, HistoryItem, PromptDoc } from "@/lib/types";
import { resolveVaultSecret } from "@/lib/server/vault-secret";

export type VaultPayload = {
  v: 1;
  settings: AppSettings;
  history: HistoryItem[];
  folders: Folder[];
  prompts: PromptDoc[];
  defaultPromptId: string;
  selectedPromptId: string;
  lastPadPromptId: string;
  pad: string;
  padResult: string;
};

type VaultRow = { nonce: string; ciphertext: string; updated_at: string };

async function vaultKey(userId: string): Promise<Buffer> {
  const { createHash } = await import("node:crypto");
  const secret = resolveVaultSecret(process.env);
  return createHash("sha256").update(`talkai-vault-v1:${userId}:${secret}`).digest();
}

async function encrypt(
  userId: string,
  plaintext: string,
): Promise<{ nonce: string; ciphertext: string }> {
  const { createCipheriv, randomBytes } = await import("node:crypto");
  const key = await vaultKey(userId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    nonce: Buffer.concat([iv, tag]).toString("base64"),
    ciphertext: enc.toString("base64"),
  };
}

async function decrypt(userId: string, nonceB64: string, ciphertextB64: string): Promise<string> {
  const { createDecipheriv } = await import("node:crypto");
  const key = await vaultKey(userId);
  const packed = Buffer.from(nonceB64, "base64");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

function slimHistory(items: HistoryItem[]): HistoryItem[] {
  return items.slice(0, 400).map((h) => ({
    ...h,
    exchange: h.exchange
      ? {
          ...h.exchange,
          requestJson: h.exchange.requestJson.slice(0, 4000),
          responseJson: h.exchange.responseJson.slice(0, 4000),
        }
      : null,
  }));
}

function mergeGlobal(settings: AppSettings, global: Partial<AppSettings>): AppSettings {
  return { ...settings, ...global };
}

export const loadVault = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensureAdminUser } = await import("./ensure-admin");
    const { readGlobalSettings } = await import("./global-settings");
    await ensureAdminUser();
    const sql = await getSql();
    const global = await readGlobalSettings();
    const rows = await sql<VaultRow>`
      select nonce, ciphertext, updated_at::text as updated_at
      from user_vault
      where user_id = ${context.userId}
      limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: true as const, payload: null, global, updatedAt: null as string | null };
    try {
      const json = await decrypt(context.userId, row.nonce, row.ciphertext);
      const payload = JSON.parse(json) as VaultPayload;
      if (payload?.v !== 1) return { ok: false as const, error: "Vault format is unknown." };
      payload.settings.customApiKey = "";
      payload.settings = mergeGlobal(payload.settings, global);
      return { ok: true as const, payload, global, updatedAt: row.updated_at };
    } catch {
      return { ok: false as const, error: "Could not open the encrypted vault." };
    }
  });

export const saveVault = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { payload: VaultPayload }) => input)
  .handler(async ({ context, data }) => {
    const { ensureAdminUser } = await import("./ensure-admin");
    const { emailForUser, writeGlobalSettings } = await import("./global-settings");
    const { isAdminEmail } = await import("@/lib/admin");
    await ensureAdminUser();
    const slim: VaultPayload = {
      ...data.payload,
      v: 1,
      settings: { ...data.payload.settings, customApiKey: "" },
      history: slimHistory(data.payload.history ?? []),
      pad: (data.payload.pad ?? "").slice(0, 80_000),
      padResult: (data.payload.padResult ?? "").slice(0, 80_000),
    };
    const json = JSON.stringify(slim);
    if (json.length > 2_500_000) {
      return { ok: false as const, error: "Library is too large to sync." };
    }
    const { nonce, ciphertext } = await encrypt(context.userId, json);
    const sql = await getSql();
    await sql`
      insert into user_vault (user_id, nonce, ciphertext, updated_at)
      values (${context.userId}, ${nonce}, ${ciphertext}, now())
      on conflict (user_id) do update set
        nonce = excluded.nonce,
        ciphertext = excluded.ciphertext,
        updated_at = now()
    `;
    const email = await emailForUser(context.userId);
    if (isAdminEmail(email) && slim.settings) {
      await writeGlobalSettings(slim.settings);
    }
    return { ok: true as const };
  });
