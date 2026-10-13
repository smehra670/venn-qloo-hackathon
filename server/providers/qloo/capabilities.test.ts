import { QLOO_CAPABILITIES } from "@shared/constants";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("qloo capability drift", () => {
  it("every documented path is actually requested in client.ts", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "client.ts"), "utf8");
    for (const capability of QLOO_CAPABILITIES) {
      expect(source).toContain(`"${capability.path}"`);
    }
  });
});
