/**
 * Phase 1 left this as a stub. The real pipeline now lives in facts.ts (fact extraction),
 * prompt.ts (system/user prompts), validate.ts (schema + citation checks), and ai.ts
 * (orchestration + budget). This file re-exports the public entry point so existing
 * imports of `server/brief/llm.js` keep working.
 */
export { writeAiBrief, briefBudgetRemaining, type WriteBriefOptions } from "./ai.js";
