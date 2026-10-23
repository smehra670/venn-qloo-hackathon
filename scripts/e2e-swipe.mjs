/**
 * Swipe-to-build-your-crowd smoke (A10). Needs the app running on the mock provider:
 *   TASTE_PROVIDER=mock npm run dev        (or VENN_URL=http://localhost:5181 for another port)
 *   npm run e2e:swipe
 * At 1440px and 390px: open the deck, three Yeses by keyboard, one Undo, "That is enough",
 * then Find my partners, and assert the run request carries the swiped anchors with exact ids
 * and the same shape as a typed run (no client-only `via` field).
 * Uses Playwright's Chromium, or the installed Chrome when that is missing.
 */
const BASE = process.env.VENN_URL ?? "http://localhost:5173";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed.");
  process.exit(1);
}

async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return chromium.launch({ headless: true, channel: "chrome" });
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const browser = await launch();
for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: "networkidle" });

  const health = await (await page.request.get(`${BASE}/api/health`)).json();
  assert(health.provider === "mock", `expected the mock provider, got ${health.provider}`);

  await page.getByRole("button", { name: "Swipe your crowd" }).click();
  await page.waitForSelector(".sw-card.is-top");
  await page.waitForTimeout(600);
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(600);
  }
  assert((await page.locator(".sw-chip").count()) === 3, `${width}px: three Yeses should make three chips`);
  await page.keyboard.press("z");
  await page.waitForTimeout(300);
  assert((await page.locator(".sw-chip").count()) === 2, `${width}px: Undo should remove a chip`);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "That is enough" }).click();
  await page.getByRole("heading", { name: "That is your crowd." }).waitFor();

  let body = null;
  await page.route("**/api/runs", async (route) => {
    body = route.request().postDataJSON();
    await route.continue();
  });
  await page.locator(".sw-panel").getByRole("button", { name: "Find my partners" }).click();
  await page.waitForTimeout(800);

  assert(body, `${width}px: Find my partners did not start a run`);
  assert(Array.isArray(body.anchors) && body.anchors.length === 3, `${width}px: expected 3 anchors, got ${JSON.stringify(body.anchors)}`);
  assert(body.tasteAnchors?.length === 3, `${width}px: expected 3 taste anchors`);
  assert(body.tasteAnchors.every((a) => a.id.startsWith("mock:") && a.origin === "user"), `${width}px: swiped anchors need exact ids`);
  assert(!JSON.stringify(body).includes('"via"'), `${width}px: the run request must not carry via`);
  assert(errors.length === 0, `${width}px: page errors: ${errors.join("; ")}`);
  console.log(`${width}px ok: ${body.anchors.join(", ")}`);
}
await browser.close();
console.log("Swipe e2e ok");
