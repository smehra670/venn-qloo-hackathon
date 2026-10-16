import { describe, expect, it } from "vitest";
import { classifyAnchorStatus, resolveAnchorsForConfirm } from "./resolve.js";

describe("classifyAnchorStatus (legacy)", () => {
  it("is unresolved for no candidates or a very weak top score", () => {
    expect(classifyAnchorStatus([])).toBe("unresolved");
    expect(classifyAnchorStatus([0.2])).toBe("unresolved");
  });

  it("is auto for one confident, clear winner", () => {
    expect(classifyAnchorStatus([0.9])).toBe("auto");
    expect(classifyAnchorStatus([0.95, 0.3])).toBe("auto");
  });

  it("is ambiguous for a single middling candidate with no exact match", () => {
    expect(classifyAnchorStatus([0.5])).toBe("ambiguous");
  });

  it("is ambiguous when two candidates are too close to call, including an exact tie", () => {
    expect(classifyAnchorStatus([1, 1])).toBe("ambiguous");
    expect(classifyAnchorStatus([0.85, 0.8])).toBe("ambiguous");
  });

  it("is auto when a confident winner is well clear of a weak runner-up", () => {
    expect(classifyAnchorStatus([0.9, 0.5])).toBe("auto");
  });

  it("ignores input order", () => {
    expect(classifyAnchorStatus([0.3, 0.95])).toBe("auto");
  });
});

describe("resolveAnchorsForConfirm (mock)", () => {
  it("auto-resolves a clear brand as entity", async () => {
    const [result] = await resolveAnchorsForConfirm(["Radiohead"], { mode: "mock", skipAi: true });
    expect(result?.status).toBe("entity");
    expect(result?.selected?.kind).toBe("entity");
    expect(result?.selected?.name).toBe("Radiohead");
  });

  it("resolves Jazz Music as a topic", async () => {
    const [result] = await resolveAnchorsForConfirm(["Jazz Music"], { mode: "mock", skipAi: true });
    expect(result?.status).toBe("topic");
    expect(result?.topicCandidates.some((c) => /jazz/i.test(c.name))).toBe(true);
    expect(result?.selected?.kind).toBe("tag");
  });

  it("marks Food as too_broad", async () => {
    const [result] = await resolveAnchorsForConfirm(["Food"], { mode: "mock", skipAi: true });
    expect(result?.status).toBe("too_broad");
  });

  it("is ambiguous for Aesop (brand vs person)", async () => {
    const [result] = await resolveAnchorsForConfirm(["Aesop"], { mode: "mock", skipAi: true });
    expect(result?.status).toBe("ambiguous");
    const names = result?.entityCandidates.map((c) => c.name) ?? [];
    expect(names.filter((name) => name === "Aesop").length).toBeGreaterThanOrEqual(2);
  });

  it("never surfaces candidates below the 0.6 floor", async () => {
    const [result] = await resolveAnchorsForConfirm(["zzqxnotarealbrandnamehere"], {
      mode: "mock",
      skipAi: true,
    });
    expect(result?.status).toBe("unresolved");
    expect(result?.entityCandidates).toEqual([]);
    expect(result?.topicCandidates).toEqual([]);
  });

  it("resolves mock tag fixtures", async () => {
    const [result] = await resolveAnchorsForConfirm(["specialty coffee"], { mode: "mock", skipAi: true });
    expect(result?.status).toBe("topic");
    expect(result?.selected?.id).toBe("tag:specialty-coffee");
  });

  it("resolves one entry per input anchor, in order", async () => {
    const results = await resolveAnchorsForConfirm(["Radiohead", "Aesop", "zzqxnotarealbrandnamehere"], {
      mode: "mock",
      skipAi: true,
    });
    expect(results.map((item) => item.input)).toEqual(["Radiohead", "Aesop", "zzqxnotarealbrandnamehere"]);
    expect(results.map((item) => item.status)).toEqual(["entity", "ambiguous", "unresolved"]);
  });
});
