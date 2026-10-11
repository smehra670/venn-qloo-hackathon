const base = process.env.SMOKE_URL ?? "http://127.0.0.1:8787";

const input = {
  businessType: "cafe",
  city: "London",
  anchors: ["Aesop", "Radiohead", "pilates"],
  businessName: "Brew & Co",
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

const created = await fetch(`${base}/api/runs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
});
if (!created.ok) fail(`POST /api/runs failed: ${created.status}`);
const { runId } = await created.json();
if (!runId) fail("Missing runId");

const stream = await fetch(`${base}/api/runs/${runId}/events`);
if (!stream.ok || !stream.body) fail(`SSE failed: ${stream.status}`);
const reader = stream.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let result = null;
while (!result) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const chunks = buffer.split("\n\n");
  buffer = chunks.pop() ?? "";
  for (const chunk of chunks) {
    const line = chunk.split("\n").find((entry) => entry.startsWith("data:"));
    if (!line) continue;
    const event = JSON.parse(line.slice(5).trim());
    if (event.type === "error") fail(event.message);
    if (event.type === "result") result = event.result;
  }
}
await reader.cancel().catch(() => undefined);
if (!result) fail("Stream ended without a result");
if (result.partners.length < 12) fail(`Expected at least 12 partners, got ${result.partners.length}`);
if (result.topPicks.length !== 3) fail(`Expected 3 top picks, got ${result.topPicks.length}`);

const partnerId = result.topPicks[0]?.partnerId;
const heatmap = await fetch(`${base}/api/runs/${runId}/heatmap?partnerId=${partnerId}`);
if (!heatmap.ok) fail(`Heatmap failed: ${heatmap.status}`);
const brief = await fetch(`${base}/api/runs/${runId}/brief`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ partnerId, variant: 1 }),
});
if (!brief.ok) fail(`Brief failed: ${brief.status}`);
const briefBody = await brief.json();
console.log(
  `Smoke ok: ${result.partners.length} partners, top ${result.topPicks.map((pick) => pick.role).join(", ")}, heatmap ${heatmap.status}, brief "${briefBody.title}"`,
);
process.exit(0);
