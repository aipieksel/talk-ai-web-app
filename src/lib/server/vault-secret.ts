export function resolveVaultSecret(env: NodeJS.Dict<string> = process.env): string {
  const dedicated = String(env.TALKAI_VAULT_KEY ?? "").trim();
  if (dedicated) return dedicated;
  const auth = String(env.BETTER_AUTH_SECRET ?? "").trim();
  if (auth) return auth;
  throw new Error(
    "Talk AI vault key is not configured. Set TALKAI_VAULT_KEY or BETTER_AUTH_SECRET.",
  );
}
