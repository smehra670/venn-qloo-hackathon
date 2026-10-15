import { AnchorResolveRequestSchema } from "@shared/schemas";
import type { FastifyInstance } from "fastify";
import { resolveAnchorsForConfirm } from "../anchors/resolve.js";

/** `POST /api/anchors/resolve`: the "Check your anchors" confirm step calls this before
 * `POST /api/runs` so the setup screen can ask the user to pick between plausible readings of
 * an ambiguous anchor (see `server/anchors/resolve.ts`). Responds with a bare array to match
 * one entry per anchor in the request, in the same order. */
export function registerAnchors(app: FastifyInstance): void {
  app.post("/api/anchors/resolve", async (request, reply) => {
    const parsed = AnchorResolveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Check your anchors and try again." });
    }
    return resolveAnchorsForConfirm(parsed.data.anchors);
  });
}
