#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/";
mkdirSync("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function go(path) {
  await page.goto(new URL(path, url).href, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Walkie", { timeout: 15000 });
  await page.waitForTimeout(300);
}

await go("/");
await page.waitForSelector("text=Thursday");
await page.getByRole("button", { name: /revised deck/i }).first().click();
await page.waitForTimeout(250);
await page.screenshot({ path: "/workspace/screenshots/qa-detail-toolbar.png" });

await page.locator("a", { hasText: "Prompts" }).first().click();
await page.waitForSelector("text=Agent Brief");
await page.getByRole("button", { name: /^Agent Brief/ }).first().click();
await page.getByRole("button", { name: /Set as default/ }).click();
await page.waitForTimeout(200);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("text=Agent Brief · default");
await page.screenshot({ path: "/workspace/screenshots/qa-prompts-default.png" });

await page.locator("a", { hasText: "Pad" }).first().click();
await page.waitForSelector("text=Drop or paste");
await page.locator("textarea").first().fill("um so like I want you to refactor the pad so it remembers the last prompt I picked");
await page.locator("select[aria-label='Cleanup prompt']").selectOption("agent-brief");
await page.screenshot({ path: "/workspace/screenshots/qa-pad.png" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("text=Drop or paste");
await page.waitForTimeout(300);
const padPrompt = await page.locator("select[aria-label='Cleanup prompt']").inputValue();
const padValue = await page.locator("textarea").first().inputValue();
await page.screenshot({ path: "/workspace/screenshots/qa-pad-reload.png" });

await go("/");
await page.screenshot({ path: "/workspace/screenshots/qa-home-after.png" });

await page.setViewportSize({ width: 390, height: 844 });
await go("/");
await page.getByRole("button", { name: /revised deck/i }).first().click();
await page.waitForTimeout(250);
await page.screenshot({ path: "/workspace/screenshots/qa-detail-mobile.png" });

const stored = await page.evaluate(() => {
  const raw = localStorage.getItem("walkie-app");
  const parsed = raw ? JSON.parse(raw) : null;
  return parsed?.state ?? parsed;
});

console.log(JSON.stringify({
  errors,
  defaultPromptId: stored?.defaultPromptId,
  cleanupEnabled: stored?.settings?.cleanupEnabled,
  padPrompt,
  padKept: padValue.length > 10,
}, null, 2));

await browser.close();
