import { config } from "../config.js";
import { recordUsage } from "../usage/ledger.js";
import type { LlmClient, LlmCompletionRequest } from "./types.js";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 20_000;

export class OpenAiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OpenAiHttpError";
  }
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * OpenAI Chat Completions, asking for strict JSON via response_format. Some models reject
 * json_schema; on a 400/404 we retry once with the looser json_object mode.
 */
export class OpenAiLlmClient implements LlmClient {
  readonly provider = "openai" as const;

  constructor(private readonly apiKey: string) {}

  async completeJson<T>(request: LlmCompletionRequest): Promise<T> {
    return this.send<T>(request, {
      type: "json_schema",
      json_schema: { name: request.schema.name, strict: true, schema: request.schema.schema },
    });
  }

  async critic<T>(request: LlmCompletionRequest, previous: unknown, issues: string[]): Promise<T> {
    const repairUser = [
      request.user,
      "",
      "Your previous answer failed validation:",
      ...issues.map((issue) => `- ${issue}`),
      "Previous answer (do not repeat these mistakes):",
      JSON.stringify(previous),
      "",
      "Return corrected JSON only, matching the schema exactly.",
    ].join("\n");
    return this.completeJson<T>({ ...request, user: repairUser });
  }

  private async send<T>(request: LlmCompletionRequest, responseFormat: Record<string, unknown>): Promise<T> {
    recordUsage("llm");
    const model = request.model ?? config.llmModel;
    const body = {
      model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      response_format: responseFormat,
      temperature: 0.4,
      // GPT-6 Luna supports Chat Completions structured output with reasoning off.
      reasoning_effort: "none",
    };

    let response = await this.post(body);
    if (!response.ok && (response.status === 400 || response.status === 404)) {
      // Some models reject json_schema outright; fall back to the looser json_object mode.
      response = await this.post({ ...body, response_format: { type: "json_object" } });
    }
    if (!response.ok) {
      const detail = await safeErrorDetail(response);
      throw new OpenAiHttpError(`OpenAI request failed (${response.status}): ${detail}`, response.status);
    }

    const json = (await response.json()) as ChatCompletionResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new OpenAiHttpError("OpenAI returned no content.", 502);
    try {
      return JSON.parse(content) as T;
    } catch {
      throw new OpenAiHttpError("OpenAI returned invalid JSON.", 502);
    }
  }

  private async post(body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new OpenAiHttpError("OpenAI request timed out.", 0);
      }
      throw new OpenAiHttpError("Could not reach OpenAI. Check your connection and try again.", 0);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function safeErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
