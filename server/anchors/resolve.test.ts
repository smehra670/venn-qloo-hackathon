import { describe, expect, it } from "vitest";
import { classifyAnchorStatus, resolveAnchorsForConfirm } from "./resolve.js";

describe("classifyAnchorStatus (pure)", () => {
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

describe("resolveAnchorsForConfirm", () => {
  it("auto-resolves a clear, unambiguous brand name", () => {
    const [result] = resolveAnchorsForConfirm(["Radiohead"]);
    expect(result?.status).toBe("auto");
    expect(result?.candidates).toHaveLength(1);
    expect(result?.candidates[0]?.entityName).toBe("Radiohead");
  });

  it("is ambiguous for the deliberately ambiguous 'Aesop' fixture (brand vs storyteller)", () => {
    const [result] = resolveAnchorsForConfirm(["Aesop"]);
    expect(result?.status).toBe("ambiguous");
    const names = result?.candidates.map((candidate) => candidate.entityName) ?? [];
    expect(names.filter((name) => name === "Aesop").length).toBeGreaterThanOrEqual(2);
    const entityTypes = new Set(result?.candidates.map((candidate) => candidate.entityType));
    expect(entityTypes.has("brand")).toBe(true);
    expect(entityTypes.has("person")).toBe(true);
  });

  it("is unresolved for text with no plausible match in the demo catalog", () => {
    const [result] = resolveAnchorsForConfirm(["zzqxnotarealbrandnamehere"]);
    expect(result?.status).toBe("unresolved");
    expect(result?.candidates).toEqual([]);
  });

  it("resolves one entry per input anchor, in order", () => {
    const results = resolveAnchorsForConfirm(["Radiohead", "Aesop", "zzqxnotarealbrandnamehere"]);
    expect(results.map((item) => item.input)).toEqual(["Radiohead", "Aesop", "zzqxnotarealbrandnamehere"]);
    expect(results.map((item) => item.status)).toEqual(["auto", "ambiguous", "unresolved"]);
  });
});
