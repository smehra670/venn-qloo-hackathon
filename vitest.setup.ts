process.env.MOCK_LATENCY = "off";
process.env.TASTE_PROVIDER = "mock";
process.env.NODE_ENV = "test";
// Tests never reach live services. dotenv (loaded by server/config.ts) never overrides a
// variable that is already set, even to "", so blanking these keeps the developer's .env keys
// (and their quota and bills) out of the suite.
process.env.LLM_PROVIDER = "none";
process.env.OPENAI_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";
process.env.LLM_API_KEY = "";
process.env.QLOO_API_KEY = "test-qloo-key"; // never valid: a test that forgets to stub fetch gets a 401, not real quota
