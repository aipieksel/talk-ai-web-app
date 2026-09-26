import { getSql } from "@/lib/db";
import { providerDefinition, PROVIDERS } from "@/lib/providers";

type CredentialRow = {
  provider: string;
  nonce: string;
  ciphertext: string;
  last_four: string;
};

export type ProviderCredentialStatus = {
  provider: string;
  configured: boolean;
  source: "environment" | "vault" | "none";
  lastFour: string;
  unreadable?: boolean;
};

async function ensureSchema() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists provider_credential (
      provider text primary key,
      nonce text not null,
      ciphertext text not null,
      last_four text not null,
      updated_at timestamptz not null default now()
    )
  `);
}

async function encryptionKey(): Promise<Buffer> {
  const { createHash } = await import("node:crypto");
  const secret =
    process.env.PROVIDER_CREDENTIAL_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.DATABASE_URL ||
    process.env.XAI_API_KEY ||
    "talkai-local-provider-vault";
  return createHash("sha256").update(`talkai-provider-v1:${secret}`).digest();
}

async function encrypt(plaintext: string): Promise<{ nonce: string; ciphertext: string }> {
  const { createCipheriv, randomBytes } = await import("node:crypto");
  const key = await encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    nonce: Buffer.concat([iv, tag]).toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

async function decrypt(nonce: string, ciphertext: string): Promise<string> {
  const { createDecipheriv } = await import("node:crypto");
  const key = await encryptionKey();
  const packed = Buffer.from(nonce, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function environmentCredential(providerId: string): string {
  const definition = providerDefinition(providerId);
  if (!definition?.envKey) return "";
  return process.env[definition.envKey]?.trim() ?? "";
}

async function storedRow(providerId: string): Promise<CredentialRow | null> {
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql.query<CredentialRow>(
    `select provider, nonce, ciphertext, last_four from provider_credential where provider = $1 limit 1`,
    [providerId],
  );
  return rows[0] ?? null;
}

export async function getProviderCredential(providerId: string): Promise<string> {
  const fromEnvironment = environmentCredential(providerId);
  if (fromEnvironment) return fromEnvironment;
  const row = await storedRow(providerId);
  if (!row) return "";
  try {
    return await decrypt(row.nonce, row.ciphertext);
  } catch {
    throw new Error(
      `The saved ${providerDefinition(providerId)?.label ?? providerId} credential could not be opened.`,
    );
  }
}

export async function saveProviderCredential(providerId: string, apiKey: string): Promise<string> {
  const definition = providerDefinition(providerId);
  if (!definition || definition.local) throw new Error("This provider does not accept an API key.");
  const key = apiKey.trim();
  if (!key) throw new Error("API key is empty.");
  const { nonce, ciphertext } = await encrypt(key);
  const lastFour = key.slice(-4);
  await ensureSchema();
  const sql = await getSql();
  await sql.query(
    `insert into provider_credential (provider, nonce, ciphertext, last_four, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (provider) do update set
       nonce = excluded.nonce,
       ciphertext = excluded.ciphertext,
       last_four = excluded.last_four,
       updated_at = now()`,
    [providerId, nonce, ciphertext, lastFour],
  );
  return lastFour;
}

export async function providerCredentialStatuses(): Promise<ProviderCredentialStatus[]> {
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql.query<CredentialRow>(
    `select provider, nonce, ciphertext, last_four from provider_credential`,
  );
  const stored = new Map(rows.map((row) => [row.provider, row]));
  return Promise.all(
    PROVIDERS.filter((provider) => !provider.local).map(async (provider) => {
      const fromEnvironment = environmentCredential(provider.id);
      if (fromEnvironment) {
        return {
          provider: provider.id,
          configured: true,
          source: "environment" as const,
          lastFour: fromEnvironment.slice(-4),
        };
      }
      const row = stored.get(provider.id);
      if (row) {
        try {
          await decrypt(row.nonce, row.ciphertext);
        } catch {
          return {
            provider: provider.id,
            configured: false,
            source: "vault" as const,
            lastFour: row.last_four,
            unreadable: true,
          };
        }
      }
      const lastFour = row?.last_four ?? "";
      return {
        provider: provider.id,
        configured: Boolean(lastFour),
        source: lastFour ? ("vault" as const) : ("none" as const),
        lastFour,
      };
    }),
  );
}
