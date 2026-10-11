import { buildApp } from "./app.js";
import { config } from "./config.js";
import { abortAll } from "./runs/store.js";

const app = await buildApp();

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, "shutting down");
  abortAll();
  await app.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await app.listen({ port: config.port, host: config.host });
app.log.info({ port: config.port, host: config.host, provider: config.tasteProvider }, "venn listening");
