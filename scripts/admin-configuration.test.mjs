import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const admin = new URL("../src/lib/admin.ts", import.meta.url).href;
function evaluate(owner, email) {
  const code = `const {isAdminEmail}=await import(${JSON.stringify(admin)}); console.log(isAdminEmail(${JSON.stringify(email)}));`;
  return execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", code], {
    encoding: "utf8", env: { ...process.env, TALKAI_ADMIN_EMAIL: owner },
  }).trim();
}
test("only the configured owner matches, normalized; no owner means no admin", () => {
  assert.equal(evaluate(" Owner@Example.com ", "owner@example.com"), "true");
  assert.equal(evaluate("owner@example.com", "other@example.com"), "false");
  assert.equal(evaluate("", ""), "false");
  assert.equal(evaluate("", null), "false");
});
test("client reads server role and never embeds owner configuration", () => {
  const hook = readFileSync(new URL("../src/lib/auth/use-current-user.ts", import.meta.url), "utf8");
  assert.ok(!hook.includes("isAdminEmail"));
  assert.ok(!hook.includes("TALKAI_ADMIN_EMAIL"));
  const source = readFileSync(new URL("../src/lib/auth/server.ts", import.meta.url), "utf8");
  assert.match(source, /customSession[\s\S]*isAdmin: isAdminEmail\(user.email\)/);
});
