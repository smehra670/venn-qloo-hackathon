import { MAX_PARTNERS } from "@shared/constants";
import { BriefRequestSchema, BusinessInputSchema, ExpandRequestSchema, HeatmapQuerySchema } from "@shared/schemas";
import type { AgentEvent, StoredEvent } from "@shared/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { writeAiBrief } from "../brief/ai.js";
import { config } from "../config.js";
import { getProvider } from "../providers/index.js";
import { attachRelated } from "../providers/mock/engine.js";
import type { ProviderContext } from "../providers/types.js";
import { executeRun } from "../runs/runner.js";
import { getScheduler } from "../runs/scheduler.js";
import { append, canStartRun, createRun, getRun, recordRun, type Run } from "../runs/store.js";
import { waitForLatency } from "../runs/trace.js";

const EXPIRED = "That search has expired. Start a new one.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function quietContext(): ProviderContext {
  const signal = AbortSignal.timeout(20_000);
  return {
    signal,
    async trace(_tool, _args, fn) {
      await waitForLatency(signal);
      return fn();
    },
  };
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function requireRun(id: string): Run {
  const run = getRun(id);
  if (!run) throw httpError(404, EXPIRED);
  return run;
}

function requireResult(run: Run) {
  if (!run.result) throw httpError(409, "That search is still running.");
  return run.result;
}

function eventPayload(event: StoredEvent): AgentEvent {
  const { id: _id, at: _at, ...payload } = event;
  return payload;
}

export function registerRuns(app: FastifyInstance): void {
  app.post(
    "/api/runs",
    {
      config: {
        rateLimit: {
          max: config.rateLimitRunsPerMin,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parsed = BusinessInputSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Check the form and try again.";
        return reply.code(400).send({ error: message });
      }
      if (!canStartRun(request.ip)) {
        return reply.code(429).send({ error: "Daily search limit reached for this network. Try again tomorrow." });
      }
      const scheduler = getScheduler();
      if (scheduler.status().queued >= config.queueMax) {
        return reply.code(503).send({ error: "Too many searches queued right now. Try again shortly." });
      }
      const live = isRecord(request.body) && request.body.live === true;
      const run = createRun(parsed.data, { live });
      recordRun(request.ip);
      scheduler.enqueue(run, () => {
        void executeRun(run, (fields) => {
          request.log.info(fields, "run finished");
        }).finally(() => scheduler.release());
      });
      return reply.send({ runId: run.id });
    },
  );

  app.get("/api/runs/:id/events", (request: FastifyRequest<{ Params: { id: string }; Querystring: { lastEventId?: string } }>, reply: FastifyReply) => {
    const run = getRun(request.params.id);
    if (!run) {
      return reply.code(404).send({ error: EXPIRED });
    }
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    raw.write("retry: 2000\n\n");

    const header = request.headers["last-event-id"];
    const headerId = Array.isArray(header) ? header[0] : header;
    const last = Number(request.query.lastEventId ?? headerId ?? 0) || 0;
    let closed = false;

    const writeEvent = (event: StoredEvent) => {
      if (closed) return;
      const body = JSON.stringify(eventPayload(event));
      raw.write(`id: ${event.id}\nevent: agent\ndata: ${body}\n\n`);
    };

    const finish = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      run.subscribers.delete(onEvent);
      if (!raw.writableEnded) raw.end();
    };

    for (const event of run.events) {
      if (event.id > last) writeEvent(event);
    }

    const terminal = run.events.some((event) => event.type === "result" || event.type === "error" || event.type === "cancelled");
    if (terminal || run.status !== "running") {
      finish();
      return;
    }

    const onEvent = (event: StoredEvent) => {
      writeEvent(event);
      if (event.type === "result" || event.type === "error" || event.type === "cancelled") finish();
    };
    run.subscribers.add(onEvent);
    const heartbeat = setInterval(() => {
      if (!closed) raw.write(": ping\n\n");
    }, 15_000);

    raw.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      run.subscribers.delete(onEvent);
    });
    return;
  });

  app.get("/api/runs/:id", async (request: FastifyRequest<{ Params: { id: string } }>) => {
    const run = requireRun(request.params.id);
    return { status: run.status, result: run.result, error: run.error };
  });

  app.delete("/api/runs/:id", async (request: FastifyRequest<{ Params: { id: string } }>) => {
    const run = requireRun(request.params.id);
    if (run.status === "running") {
      run.abort.abort();
      append(run, { type: "cancelled" });
    }
    return { ok: true };
  });

  app.post("/api/runs/:id/expand", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const parsed = ExpandRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Choose a partner to expand." });
    const run = requireRun(request.params.id);
    const result = requireResult(run);
    const partner = result.partners.find((item) => item.id === parsed.data.partnerId);
    if (!partner) return reply.code(404).send({ error: "That partner is not in this search." });
    if (result.partners.length >= MAX_PARTNERS) {
      return { added: [], message: "This map already has 28 partners, which is the limit." };
    }
    const added = await getProvider().expand(result, partner.id, quietContext());
    if (added.length > 0) {
      result.partners = [...result.partners, ...added];
      attachRelated(result.partners);
    }
    return {
      added,
      message: added.length > 0 ? undefined : "No further connections in the demo set.",
    };
  });

  app.get(
    "/api/runs/:id/heatmap",
    async (request: FastifyRequest<{ Params: { id: string }; Querystring: { partnerId?: string } }>, reply) => {
      const parsed = HeatmapQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: "Check the partner and try again." });
      const run = requireRun(request.params.id);
      const result = requireResult(run);
      const partnerId =
        parsed.data.partnerId ??
        result.topPicks.find((pick) => pick.role === "best_overall")?.partnerId ??
        result.partners[0]?.id;
      if (!partnerId) return reply.code(204).send();
      if (!result.partners.some((partner) => partner.id === partnerId)) {
        return reply.code(404).send({ error: "That partner is not in this search." });
      }
      if (run.heatmaps.has(partnerId)) {
        const cached = run.heatmaps.get(partnerId);
        if (!cached) return reply.code(204).send();
        return cached;
      }
      const heatmap = await getProvider().heatmap(result, partnerId, quietContext());
      run.heatmaps.set(partnerId, heatmap);
      if (!heatmap) return reply.code(204).send();
      return heatmap;
    },
  );

  app.post("/api/runs/:id/brief", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const parsed = BriefRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Choose a partner and a concept." });
    const run = requireRun(request.params.id);
    const result = requireResult(run);
    const partner = result.partners.find((item) => item.id === parsed.data.partnerId);
    if (!partner) return reply.code(404).send({ error: "That partner is not in this search." });
    const variant = parsed.data.variant % 3;
    const tone = parsed.data.tone ?? "warm";
    const length = parsed.data.length ?? "standard";
    const regenerate = parsed.data.regenerate === true;
    const key = `${partner.id}:${variant}:${tone}:${length}`;
    if (!regenerate) {
      const cached = run.briefs.get(key);
      if (cached) return cached;
    }
    const brief = await writeAiBrief(result, partner, { variant, tone, length });
    run.briefs.set(key, brief);
    return brief;
  });
}
