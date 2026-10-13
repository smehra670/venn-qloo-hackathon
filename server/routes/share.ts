import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createShare, getRun, getShare } from "../runs/store.js";

const EXPIRED = "That search has expired. Start a new one.";
const SHARE_EXPIRED = "This share link has expired or does not exist.";

export function registerShare(app: FastifyInstance): void {
  app.post("/api/runs/:id/share", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const run = getRun(request.params.id);
    if (!run) return reply.code(404).send({ error: EXPIRED });
    if (!run.result) return reply.code(409).send({ error: "That search is still running." });
    const share = createShare(run);
    return { token: share.token, expiresAt: share.expiresAt };
  });

  app.get("/api/share/:token", async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const share = getShare(request.params.token);
    if (!share) return reply.code(404).send({ error: SHARE_EXPIRED });
    return { result: share.result };
  });
}
