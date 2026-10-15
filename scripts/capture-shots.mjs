/**
 * Captures Graph / Map / Brief product shots into public/shots/*.webp
 * from a saved example run. Falls back silently if Playwright is unavailable.
 *
 * Usage (dev servers on 5173 / 8787):
 *   npx --yes playwright@1.55.0 install chromium
 *   node scripts/capture-shots.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "shots");
const BASE = process.env.VENN_URL ?? "http://localhost:5173";

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.warn("Playwright not installed — keeping SVG fallbacks in public/shots/.");
    process.exit(0);
  }

  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
    const example = page.getByRole("button", { name: /Brew & Co in London/i });
    await example.click();
    await page.waitForTimeout(800);
    const submit = page.getByRole("button", { name: /^Find my partners$/i }).last();
    await submit.click();

    const looksGood = page.getByRole("button", { name: /Looks good/i });
    try {
      await looksGood.waitFor({ timeout: 4000 });
      await looksGood.click();
    } catch {
      /* examples often skip confirm */
    }

    await page.getByRole("button", { name: "New search" }).waitFor({ timeout: 120_000 });

    const shots = [
      { name: "graph", prepare: async () => page.getByRole("radio", { name: "Graph" }).or(page.getByText("Graph", { exact: true })).first().click().catch(() => {}) },
      {
        name: "map",
        prepare: async () => {
          await page.getByText("Map", { exact: true }).first().click();
          await page.waitForTimeout(1200);
        },
      },
      {
        name: "brief",
        prepare: async () => {
          await page.getByText("Shortlist", { exact: true }).first().click();
          await page.waitForTimeout(400);
          const brief = page.getByRole("button", { name: "Brief" }).first();
          await brief.click();
          await page.waitForTimeout(1500);
        },
      },
    ];

    for (const shot of shots) {
      await shot.prepare();
      await page.waitForTimeout(600);
      const buf = await page.screenshot({ type: "png" });
      // Prefer sharp if present; otherwise write PNG and note WebP skip.
      try {
        const sharp = (await import("sharp")).default;
        const webp = await sharp(buf).resize(640, 400, { fit: "cover", position: "top" }).webp({ quality: 72 }).toBuffer();
        if (webp.byteLength > 120_000) {
          const tighter = await sharp(buf).resize(640, 400, { fit: "cover", position: "top" }).webp({ quality: 55 }).toBuffer();
          await writeFile(path.join(OUT, `${shot.name}.webp`), tighter);
        } else {
          await writeFile(path.join(OUT, `${shot.name}.webp`), webp);
        }
        console.log(`wrote ${shot.name}.webp (${webp.byteLength} bytes)`);
      } catch {
        await writeFile(path.join(OUT, `${shot.name}.png`), buf);
        console.warn(`sharp unavailable — wrote ${shot.name}.png; convert to webp manually if needed`);
      }
      if (shot.name === "brief") {
        await page.keyboard.press("Escape").catch(() => {});
      }
    }
  } catch (err) {
    console.warn("Shot capture failed — SVG fallbacks remain.", err instanceof Error ? err.message : err);
    process.exitCode = 0;
  } finally {
    await browser.close();
  }
}

await main();
