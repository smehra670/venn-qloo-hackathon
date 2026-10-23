import { Send, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useVenn } from "@/store/useVenn";

const STARTERS = [
  "Which partner is easiest to approach first?",
  "Why is my top pick ranked above the others?",
  "Which of these has a real location nearby?",
];

/** The brand mark (same two-circle motif as the logo and the fit-lens in the brief sheet),
 * sized as a chat avatar so every answer visibly comes from Venn — never "AI". */
function VennMark({ className }: { className?: string }) {
  const lensId = useId();
  return (
    <svg viewBox="0 0 40 28" className={className} aria-hidden="true">
      <defs>
        <clipPath id={lensId}>
          <circle cx="14" cy="14" r="13" />
        </clipPath>
      </defs>
      <circle cx="14" cy="14" r="13" fill="#FF6B57" />
      <circle cx="26" cy="14" r="13" fill="#4F5BFF" />
      <circle cx="26" cy="14" r="13" fill="#6B3FA0" clipPath={`url(#${lensId})`} />
    </svg>
  );
}

function VennAvatar() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F4F5F7]">
      <VennMark className="h-4 w-[1.4rem]" />
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 rounded-2xl rounded-bl-sm bg-[#F4F5F7] px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </span>
  );
}

export function ChatPanel() {
  const open = useVenn((state) => state.chatOpen);
  const close = useVenn((state) => state.closeChat);
  const messages = useVenn((state) => state.chatMessages);
  const loading = useVenn((state) => state.chatLoading);
  const status = useVenn((state) => state.chatStatus);
  const send = useVenn((state) => state.sendChat);
  const health = useVenn((state) => state.health);
  const partners = useVenn((state) => state.result?.partners ?? []);
  const select = useVenn((state) => state.select);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const llmOn = health?.llm?.enabled ?? false;
  const blocked = !llmOn || status !== "ok";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  if (!open) return null;

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || blocked) return;
    setDraft("");
    void send(trimmed);
  };

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-panel-title"
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-[12px] border border-line bg-paper md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[26rem] md:rounded-none md:border-y-0 md:border-r-0"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F4F5F7]">
            <VennMark className="h-5 w-[1.75rem]" />
          </span>
          <div>
            <h2 id="chat-panel-title" className="font-bold text-lg tracking-tight">Ask Venn</h2>
            <p className="text-xs text-ink-soft">Grounded in this search — nothing outside it</p>
          </div>
        </div>
        <button type="button" aria-label="Close" onClick={close} className="min-h-11 min-w-11 rounded-full p-2 hover:bg-paper-2">
          <X size={18} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">Ask about the results of this search — who to approach, why something ranked where it did, what's missing.</p>
            {!llmOn ? null : (
              <div className="flex flex-col items-start gap-2">
                {STARTERS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => ask(question)}
                    className="rounded-2xl border border-line px-3.5 py-2 text-left text-sm text-ink hover:bg-paper-2"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {messages.map((turn, index) => {
          if (turn.role === "user") {
            return (
              <div key={index} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-sm leading-relaxed text-paper">
                  {turn.content}
                </p>
              </div>
            );
          }
          const mentioned = (turn.partnerIds ?? [])
            .map((id) => partners.find((partner) => partner.id === id))
            .filter((partner): partner is NonNullable<typeof partner> => Boolean(partner));
          return (
            <div key={index} className="flex items-start gap-2">
              <VennAvatar />
              <div className="flex max-w-[78%] flex-col items-start">
                <p className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-[#F4F5F7] px-4 py-2.5 text-sm leading-relaxed text-ink">
                  {turn.content}
                </p>
                {mentioned.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {mentioned.map((partner) => (
                      <button
                        key={partner.id}
                        type="button"
                        onClick={() => select(partner.id)}
                        className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-paper-2"
                      >
                        {partner.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {loading ? (
          <div className="flex items-start gap-2">
            <VennAvatar />
            <TypingDots />
          </div>
        ) : null}

        {!loading && status === "disabled" ? (
          <div className="flex items-start gap-2">
            <VennAvatar />
            <p className="max-w-[78%] rounded-2xl rounded-bl-sm bg-[#F4F5F7] px-4 py-2.5 text-sm leading-relaxed text-ink-soft">
              Ask Venn needs an AI key configured on this server (set <code className="font-mono text-xs">LLM_PROVIDER</code>). You can still read everything else in this search.
            </p>
          </div>
        ) : null}
        {!loading && status === "budget" ? (
          <div className="flex items-start gap-2">
            <VennAvatar />
            <p className="max-w-[78%] rounded-2xl rounded-bl-sm bg-[#F4F5F7] px-4 py-2.5 text-sm leading-relaxed text-ink-soft">
              This search has used up its chat budget. Start a new search to keep asking.
            </p>
          </div>
        ) : null}
      </div>

      {!llmOn ? (
        <div className="border-t border-line px-5 py-4 text-sm text-ink-soft">
          Ask Venn needs an AI key configured on this server (set <code className="font-mono text-xs">LLM_PROVIDER</code>).
        </div>
      ) : (
        <form
          className="flex items-center gap-2 border-t border-line px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            ask(draft);
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={status === "budget"}
            placeholder={status === "budget" ? "Chat budget used up" : "Ask about these results…"}
            aria-label="Message"
            className="min-h-11 flex-1 rounded-full border border-line bg-paper px-4 text-sm text-ink outline-none focus:border-ink disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || loading || status === "budget"}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </form>
      )}
    </aside>
  );
}
