import { afterEach, describe, expect, it, vi } from "vitest";

// config.ts throws at module-evaluation time, so each scenario needs a fresh module
// instance (vi.resetModules + a fresh dynamic import) with process.env set up first.
const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, ORIGINAL_ENV);
}

afterEach(() => {
  resetEnv();
  vi.resetModules();
});

describe("LLM provider boot checks (config.ts)", () => {
  it("throws a clear error when LLM_PROVIDER=openai has no key outside test", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    process.env.LLM_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLM_API_KEY;
    await expect(import("./config.js")).rejects.toThrow(/LLM_PROVIDER=openai requires OPENAI_API_KEY/);
  });

  it("throws a clear error when LLM_PROVIDER=anthropic has no key outside test", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    process.env.LLM_PROVIDER = "anthropic";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.LLM_API_KEY;
    await expect(import("./config.js")).rejects.toThrow(/LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY/);
  });

  it("does not throw for LLM_PROVIDER=openai without a key when NODE_ENV=test", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
    process.env.LLM_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLM_API_KEY;
    const { config } = await import("./config.js");
    expect(config.llmProvider).toBe("openai");
    expect(config.llmApiKey).toBeUndefined();
  });

  it("boots fine for LLM_PROVIDER=openai when a key is present", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-key";
    delete process.env.LLM_API_KEY;
    const { config } = await import("./config.js");
    expect(config.llmApiKey).toBe("sk-test-key");
  });

  it("resolves the anthropic key from ANTHROPIC_API_KEY, not OPENAI_API_KEY", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    process.env.LLM_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    process.env.OPENAI_API_KEY = "sk-should-be-ignored";
    delete process.env.LLM_API_KEY;
    const { config } = await import("./config.js");
    expect(config.llmApiKey).toBe("anthropic-test-key");
  });

  it("never throws or silently swaps providers for LLM_PROVIDER=none", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    process.env.LLM_PROVIDER = "none";
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.LLM_API_KEY;
    const { config } = await import("./config.js");
    expect(config.llmProvider).toBe("none");
  });
});

describe("getLlm() (second line of defense)", () => {
  it("throws for openai with no key outside test, matching config.ts's message", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    process.env.LLM_PROVIDER = "fake"; // let config.ts boot, then flip provider below.
    const configModule = await import("./config.js");
    const { getLlm } = await import("./llm/index.js");
    // Simulate a provider flip without a key, bypassing config.ts's own parse-time guard.
    (configModule.config as { llmProvider: string }).llmProvider = "openai";
    (configModule.config as { llmApiKey: string | undefined }).llmApiKey = undefined;
    expect(() => getLlm()).toThrow(/LLM_PROVIDER=openai requires OPENAI_API_KEY/);
  });

  it("throws for anthropic with no key outside test, matching config.ts's message", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    process.env.LLM_PROVIDER = "fake";
    const configModule = await import("./config.js");
    const { getLlm } = await import("./llm/index.js");
    (configModule.config as { llmProvider: string }).llmProvider = "anthropic";
    (configModule.config as { llmApiKey: string | undefined }).llmApiKey = undefined;
    expect(() => getLlm()).toThrow(/LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY/);
  });
});
