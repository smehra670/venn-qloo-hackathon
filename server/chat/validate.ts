import { z } from "zod";
import type { ChatFactPack } from "./facts.js";

const ChatLlmReplySchema = z.object({
  reply: z.string().min(1).max(1200),
  partnerIds: z.array(z.string()).max(10),
});

export type ChatLlmReply = z.infer<typeof ChatLlmReplySchema>;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

/**
 * Validates the LLM's JSON against the chat reply shape. `partnerIds` is a UI affordance, not a
 * factual claim the way a brief's evidence citations are — an id the model got wrong is quietly
 * dropped rather than failing the whole reply, so one bad id doesn't cost a round trip on an
 * otherwise-grounded answer.
 */
export function validateChatPayload(raw: unknown, factPack: ChatFactPack): ValidationResult<ChatLlmReply> {
  const parsed = ChatLlmReplySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`) };
  }
  const validIds = new Set(factPack.partners.map((partner) => partner.id));
  return { ok: true, value: { ...parsed.data, partnerIds: parsed.data.partnerIds.filter((id) => validIds.has(id)) } };
}
