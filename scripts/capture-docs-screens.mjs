/**
 * Saves Setup / Research / Results views / About screenshots to docs/screens/
 * at 1440x900 and 390x844.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "screens");
const BASE = process.env.VENN_URL ?? "http://localhost:5173";

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

async function shot(page, name) {
  const buf = await page.screenshot({ type: "png", fullPage: false });
  await writeFile(path.join(OUT, `${name}.png`), buf);
  console.log("wrote", name);
}

async function runViewport(browser, vp) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(500);
  await shot(page, `setup-${vp.name}`);

  // About
  const aboutBtn = page.getByRole("button", { name: /^About$/i }).first();
  await aboutBtn.click();
  await page.waitForTimeout(400);
  await shot(page, `about-${vp.name}`);
  await page.getByRole("button", { name: /^Close$/i }).click().catch(() => page.keyboard.press("Escape"));
  await page.waitForTimeout(300);

  // Start example run
  await page.getByRole("button", { name: /Brew & Co in London/i }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /^Find my partners$/i }).last().click();
  const looksGood = page.getByRole("button", { name: /Looks good/i });
  try {
    await looksGood.waitFor({ timeout: 5000 });
    await looksGood.click();
  } catch {
    /* skip */
  }

  try {
    await page.getByRole("heading", { name: /Looking for crowds|Found your overlap|The search paused/i }).waitFor({ timeout: 15_000 });
    await shot(page, `research-${vp.name}`);
  } catch {
    console.warn("research screen missed for", vp.name);
  }

  await page.getByRole("button", { name: "New search" }).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(800);
  await shot(page, `results-graph-${vp.name}`);

  for (const view of ["Map", "Shortlist", "Proof", "Plan"]) {
    // Desktop tabs sit in the header; mobile tabs are the fixed bottom segmented control.
    const tab = page.getByRole("radio", { name: view }).last();
    await tab.click({ force: true });
    await page.waitForTimeout(700);
    await shot(page, `results-${view.toLowerCase()}-${vp.name}`);
  }

  await page.close();
}

async function main() {
  const { chromium } = await import("playwright");
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of VIEWPORTS) {
      await runViewport(browser, vp);
    }
  } finally {
    await browser.close();
  }
}

await main();
