#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/";
mkdirSync("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const t = msg.text();
    if (t.includes("same key")) return;
    errors.push(t);
  }
});

const navMs = {};
async function go(path, name) {
  const t0 = Date.now();
  await page.goto(new URL(path, url).href, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(80);
  const t1 = Date.now();
  navMs[name] = t1 - t0;
}

await go("/", "home");
await page.waitForSelector("text=Library");
await page.screenshot({ path: "/workspace/screenshots/qa-home.png" });

const t0 = Date.now();
await page.locator("a", { hasText: "Settings" }).first().click();
await page.waitForSelector("text=Appearance");
navMs.settingsClick = Date.now() - t0;
await page.screenshot({ path: "/workspace/screenshots/qa-settings.png" });
const tLib = Date.now();
await page.locator("a", { hasText: "Library" }).first().click();
await page.waitForSelector("text=TALK");
navMs.backToLibrary = Date.now() - tLib;
const tSet2 = Date.now();
await page.locator("a", { hasText: "Settings" }).first().click();
await page.waitForSelector("text=Appearance");
navMs.settingsSecond = Date.now() - tSet2;

await page.getByRole("button", { name: "Harbor" }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: "/workspace/screenshots/qa-theme-harbor.png" });
await page.getByRole("button", { name: "Midnight" }).click();

await page.getByRole("button", { name: "Security" }).click();
await page.waitForSelector("text=Sign-in lock");
await page.screenshot({ path: "/workspace/screenshots/qa-security.png" });

await page.locator("a", { hasText: "Prompts" }).first().click();
await page.waitForSelector("text=Agent Brief");
await page.waitForSelector("text=Dev Checklist");
await page.screenshot({ path: "/workspace/screenshots/qa-prompts.png" });
await page.getByRole("button", { name: /Agent Brief/ }).first().click();
await page.waitForTimeout(200);
const body = await page.locator("body").innerText();
if (!body.includes("Agent Brief")) errors.push("Agent Brief prompt missing");

await page.locator("a", { hasText: "Settings" }).first().click();
await page.getByRole("button", { name: "Security" }).click();
await page.getByPlaceholder("walkie").fill("qa_user");
const passwords = page.locator('input[type="password"]');
await passwords.nth(0).fill("correcthorse");
await passwords.nth(1).fill("correcthorse");
await page.getByRole("button", { name: "Enable sign-in" }).click();
await page.waitForTimeout(1200);
const toastText = await page.locator("[data-sonner-toast], li[data-type], [role=status]").allInnerTexts().catch(() => []);
const enabled = (await page.getByText("Sign-in is on", { exact: false }).count()) > 0
  || toastText.some((t) => /sign-in is on|updated/i.test(t));
if (!enabled) {
  const body = await page.locator("body").innerText();
  errors.push(`enable lock failed toast=${JSON.stringify(toastText)} body=${body.slice(0, 500)}`);
}

await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForTimeout(600);
const lockVisible = await page.getByRole("heading", { name: "Walkie" }).count();
const signIn = await page.getByRole("button", { name: "Sign in" }).count();
if (!signIn) errors.push("lock screen missing after sign out");
await page.screenshot({ path: "/workspace/screenshots/qa-lock.png" });

await page.locator('input[name="username"]').fill("qa_user");
await page.locator('input[name="password"]').fill("wrong-password");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForTimeout(500);
const bad = await page.getByText("Could not sign in").count();
if (!bad) errors.push("wrong password did not fail");

await page.locator('input[name="password"]').fill("correcthorse");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForTimeout(900);
const back = await page.getByRole("link", { name: "Settings" }).count();
if (!back) errors.push("valid login did not unlock");

await page.locator("a", { hasText: "Settings" }).first().click();
await page.getByRole("button", { name: "Security" }).click();
await page.getByPlaceholder("Current password").fill("correcthorse");
await page.getByRole("button", { name: "Turn off" }).click();
await page.waitForTimeout(800);

await browser.close();
const report = { ok: errors.length === 0, errors, navMs, lockVisible };
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
