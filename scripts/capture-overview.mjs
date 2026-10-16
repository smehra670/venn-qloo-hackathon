/**
 * Captures Overview results screenshots for the dashboard rebuild.
 * Requires: npm run dev (5173), Playwright chromium.
 *
 *   node scripts/capture-overview.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "screens", "overview");
const BASE = process.env.VENN_URL ?? "http://localhost:5173";

async function waitOverview(page) {
  await page.getByRole("button", { name: "New search" }).waitFor({ timeout: 120_000 });
  await page.locator(".ov-page").waitFor({ timeout: 30_000 });
  await page.locator(".ov-orbit, #c-orbit, .ov-card").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1200);
}

async function runExample(page) {
  await page.goto(`${BASE}/?static=1`, { waitUntil: "networkidle", timeout: 60_000 });
  const example = page.getByRole("button", { name: /Brew & Co in London/i });
  await example.click();
  await page.waitForTimeout(500);
  const submit = page.getByRole("button", { name: /^Find my partners$/i }).last();
  await submit.click();
  const looksGood = page.getByRole("button", { name: /Looks good/i });
  try {
    await looksGood.waitFor({ timeout: 5000 });
    await looksGood.click();
  } catch {
    /* examples often skip confirm */
  }
  await waitOverview(page);
}

async function setSlider(page, value) {
  const slider = page.locator('input[aria-label="Safe fits to wildcards"]');
  await slider.waitFor({ timeout: 10_000 });
  await slider.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await page.waitForTimeout(700);
}

async function shot(page, name, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(500);
  const buf = await page.screenshot({ type: "png", fullPage: false });
  await writeFile(path.join(OUT, `${name}.png`), buf);
  console.log("wrote", name, buf.byteLength);
}

async function main() {
  const { chromium } = await import("playwright");
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await runExample(page);

    await setSlider(page, 0);
    await shot(page, "default-1440", 1440, 900);
    await shot(page, "default-390", 390, 844);

    await page.setViewportSize({ width: 1440, height: 900 });
    await setSlider(page, 100);
    await shot(page, "wildcards-1440", 1440, 900);
    await shot(page, "wildcards-390", 390, 844);

    await page.setViewportSize({ width: 1440, height: 900 });
    await setSlider(page, 0);
    const chips = page.locator(".ov-fc");
    const count = await chips.count();
    let filtered = false;
    for (let i = 0; i < count; i++) {
      const label = ((await chips.nth(i).innerText()) || "").replace(/\s+/g, " ").trim();
      if (!/^All\b/i.test(label)) {
        await chips.nth(i).click();
        filtered = true;
        console.log("filter chip:", label);
        break;
      }
    }
    if (!filtered) console.warn("no kind chip found beyond All");
    await page.waitForTimeout(700);
    await shot(page, "filtered-1440", 1440, 900);
    await shot(page, "filtered-390", 390, 844);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
