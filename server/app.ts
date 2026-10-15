import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import path from "node:path";
import { ZodError } from "zod";
import { config } from "./config.js";
import { registerAnchors } from "./routes/anchors.js";
import { registerHealth } from "./routes/health.js";
import { registerRuns } from "./routes/runs.js";
import { registerShare } from "./routes/share.js";
import { disposeStore } from "./runs/store.js";
import { closeUsageLedger } from "./usage/ledger.js";

export async function buildApp() {
  const app = Fastify({
    logger: config.nodeEnv === "test" ? false : { level: "info" },
    trustProxy: config.trustProxy,
    bodyLimit: 8 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://tiles.openfreemap.org",
          "https://*.basemaps.cartocdn.com",
          "https://*.tile.openstreetmap.org",
        ],
        connectSrc: ["'self'", "https://tiles.openfreemap.org"],
        fontSrc: ["'self'", "data:", "https://tiles.openfreemap.org"],
        workerSrc: ["'self'", "blob:"],
        childSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({ error: "Too many requests. Wait a minute and try again." }),
  });

  registerHealth(app);
  registerRuns(app);
  registerShare(app);
  registerAnchors(app);

  if (config.nodeEnv === "production") {
    const root = path.resolve(import.meta.dirname, "../client");
    await app.register(fastifyStatic, {
      root,
      decorateReply: true,
      setHeaders(response, filePath) {
        if (filePath.endsWith("index.html")) {
          response.header("Cache-Control", "no-cache");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          response.header("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api")) {
      return reply.code(404).send({ error: "That page does not exist." });
    }
    if (config.nodeEnv === "production" && request.method === "GET") {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "That page does not exist." });
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    const status = error instanceof Error ? statusOf(error) : 500;
    if (status >= 500) request.log.error(error);
    if (status === 429) {
      return reply.code(429).send({ error: "Too many searches. Wait a minute and try again." });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: error.issues[0]?.message ?? "Check the form and try again." });
    }
    const message =
      status >= 500
        ? "Something went wrong. Please try again."
        : error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";
    return reply.code(status).send({ error: message });
  });

  app.addHook("onClose", async () => {
    disposeStore();
    closeUsageLedger();
  });

  return app;
}

function statusOf(error: Error): number {
  if ("statusCode" in error && typeof error.statusCode === "number") return error.statusCode;
  if ("status" in error && typeof error.status === "number") return error.status;
  return 500;
}
