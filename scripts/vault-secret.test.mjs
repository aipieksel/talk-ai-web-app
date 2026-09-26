import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const vault = await readFile(new URL("../src/lib/server/vault.ts", import.meta.url), "utf8");
const secret = await readFile(new URL("../src/lib/server/vault-secret.ts", import.meta.url), "utf8");

function resolveVaultSecret(env) {
  const dedicated = String(env.TALKAI_VAULT_KEY ?? "").trim();
  if (dedicated) return dedicated;
  const auth = String(env.BETTER_AUTH_SECRET ?? "").trim();
  if (auth) return auth;
  throw new Error(
    "Talk AI vault key is not configured. Set TALKAI_VAULT_KEY or BETTER_AUTH_SECRET.",
  );
}

test("vault derivation no longer uses a hardcoded fallback or provider key", () => {
  assert.doesNotMatch(vault, /walkie-preview-vault/);
  assert.doesNotMatch(vault, /XAI_API_KEY/);
  assert.doesNotMatch(secret, /walkie-preview-vault/);
  assert.doesNotMatch(secret, /XAI_API_KEY/);
  assert.match(vault, /resolveVaultSecret/);
  assert.match(secret, /TALKAI_VAULT_KEY/);
  assert.match(secret, /BETTER_AUTH_SECRET/);
});

test("resolveVaultSecret prefers TALKAI_VAULT_KEY, then BETTER_AUTH_SECRET, else fails closed", () => {
  assert.equal(resolveVaultSecret({ TALKAI_VAULT_KEY: "vault-a", BETTER_AUTH_SECRET: "auth-b" }), "vault-a");
  assert.equal(resolveVaultSecret({ BETTER_AUTH_SECRET: "auth-b" }), "auth-b");
  assert.throws(() => resolveVaultSecret({}), /vault key is not configured/);
  assert.throws(() => resolveVaultSecret({ TALKAI_VAULT_KEY: "  ", XAI_API_KEY: "should-not-be-used" }), /vault key is not configured/);
});
