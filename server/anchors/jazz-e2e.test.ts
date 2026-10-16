import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { resolveAnchorsForConfirm } from "./resolve.js";

/**
 * Smoke: type jazz → pick topic → mock run accepts tasteAnchors and completes.
 */
describe("jazz topic e2e (mock)", () => {
  it("resolves Jazz Music to a tag and a run with that tasteAnchor finishes", async () => {
    const [resolution] = await resolveAnchorsForConfirm(["Jazz Music"], { mode: "mock", skipAi: true });
    expect(resolution?.status).toBe("topic");
    expect(resolution?.selected?.kind).toBe("tag");

    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        businessType: "cafe",
        city: "London",
        anchors: ["Jazz Music"],
        tasteAnchors: [
          {
            name: resolution!.selected!.name,
            kind: "tag",
            id: resolution!.selected!.id,
            type: "topic",
            origin: "qloo",
          },
        ],
      },
    });
    expect(create.statusCode).toBe(200);
    const { runId } = create.json() as { runId: string };
    expect(runId).toBeTruthy();

    let status = "running";
    let result: { resolvedAnchors?: { status: string; input: string }[]; partners?: unknown[] } | undefined;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      const poll = await app.inject({ method: "GET", url: `/api/runs/${runId}` });
      const body = poll.json() as {
        status: string;
        result?: { resolvedAnchors?: { status: string; input: string }[]; partners?: unknown[] };
      };
      status = body.status;
      result = body.result;
      if (status === "done" || status === "error" || status === "cancelled") break;
    }
    expect(status).toBe("done");
    expect(result?.resolvedAnchors?.some((a) => a.status === "keyword")).toBe(true);
    expect((result?.partners?.length ?? 0) > 0).toBe(true);
    await app.close();
  });
});
