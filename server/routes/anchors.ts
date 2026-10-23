import {
  AnchorResolveRequestSchema,
  CardsRequest,
  CardsResponse,
  RefillRequest,
  RefillResponse,
} from "@shared/schemas";
import type { FastifyInstance } from "fastify";
import { resolveAnchorsForConfirm } from "../anchors/resolve.js";
import { getProvider } from "../providers/index.js";

/** Server-side cap on one cards call, under the client's 8 second timeout. */
const CARDS_TIMEOUT_MS = 7000;

/**
 * `POST /api/anchors/resolve`: dual entity/tag resolve (per chip or batch).
 * `POST /api/anchors/cards` and `/cards/refill`: Setup's swipe deck. Both sit under the global
 * rate limiter like every other route, write nothing to the database, and never log the body.
 */
export function registerAnchors(app: FastifyInstance): void {
  app.post("/api/anchors/resolve", async (request, reply) => {
    const parsed = AnchorResolveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Check your anchors and try again." });
    }
    const { anchors, city, businessType, goal, skipAi } = parsed.data;
    return resolveAnchorsForConfirm(anchors, { city, businessType, goal, skipAi });
  });

  app.post("/api/anchors/cards", async (request, reply) => {
    const parsed = CardsRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Pick a business type and a city first." });
    }
    const signal = AbortSignal.timeout(CARDS_TIMEOUT_MS);
    try {
      return CardsResponse.parse(await getProvider().getSwipeCards(parsed.data, signal));
    } catch {
      return { status: "unavailable", cards: [], note: "Swipe cards are not available right now." } satisfies CardsResponse;
    }
  });

  app.post("/api/anchors/cards/refill", async (request, reply) => {
    const parsed = RefillRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "That refill request was not valid." });
    }
    const signal = AbortSignal.timeout(CARDS_TIMEOUT_MS);
    try {
      return RefillResponse.parse(await getProvider().getRefillCards(parsed.data, signal));
    } catch {
      return { status: "unavailable", cards: [] } satisfies RefillResponse;
    }
  });
}
