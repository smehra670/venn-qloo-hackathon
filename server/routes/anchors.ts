import { AnchorResolveRequestSchema } from "@shared/schemas";
import type { FastifyInstance } from "fastify";
import { resolveAnchorsForConfirm } from "../anchors/resolve.js";

/** `POST /api/anchors/resolve`: dual entity/tag resolve (per chip or batch). */
export function registerAnchors(app: FastifyInstance): void {
  app.post("/api/anchors/resolve", async (request, reply) => {
    const parsed = AnchorResolveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Check your anchors and try again." });
    }
    const { anchors, city, businessType, goal, skipAi } = parsed.data;
    return resolveAnchorsForConfirm(anchors, { city, businessType, goal, skipAi });
  });
}
