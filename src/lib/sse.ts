import { AgentEventSchema } from "@shared/schemas";
import type { AgentEvent } from "@shared/types";

export function openRunStream(
  runId: string,
  lastEventId: number,
  onEvent: (event: AgentEvent, id: number) => void,
  onError: (message: string) => void,
): () => void {
  const query = lastEventId > 0 ? `?lastEventId=${lastEventId}` : "";
  const source = new EventSource(`/api/runs/${runId}/events${query}`);
  let closed = false;

  const stop = () => {
    if (closed) return;
    closed = true;
    source.close();
  };

  source.addEventListener("agent", (message) => {
    const event = message as MessageEvent<string>;
    let payload: unknown;
    try {
      payload = JSON.parse(event.data);
    } catch {
      onError("A live update could not be read. Refresh to try again.");
      stop();
      return;
    }
    const parsed = AgentEventSchema.safeParse(payload);
    if (!parsed.success) {
      onError("A live update did not match the expected shape. Refresh to try again.");
      stop();
      return;
    }
    const id = Number(event.lastEventId) || 0;
    onEvent(parsed.data, id);
    if (parsed.data.type === "result" || parsed.data.type === "error" || parsed.data.type === "cancelled") stop();
  });

  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED && !closed) {
      onError("The live update connection closed. Refresh to try again.");
      stop();
    }
  };

  return stop;
}
