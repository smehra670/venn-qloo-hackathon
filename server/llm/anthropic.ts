import { config } from "../config.js";
import { recordUsage } from "../usage/ledger.js";
import type { LlmClient, LlmCompletionRequest } from "./types.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const TIMEOUT_MS = 20_000;
const MAX_TOKENS = 2000;

export class AnthropicHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AnthropicHttpError";
  }
}

interface AnthropicContentBlock {
  type: string;
  input?: unknown;
}

interface AnthropicMessageResponse {
  content?: AnthropicContentBlock[];
}

/**
 * Thin Anthropic Messages API client. Anthropic has no native `response_format: json_schema`
 * like OpenAI, so strict JSON is obtained by forcing a single tool call whose `input_schema`
 * is the requested schema — the model's structured "tool_use" input is the JSON payload.
 */
export class AnthropicLlmClient implements LlmClient {
  readonly provider = "anthropic" as const;

  constructor(private readonly apiKey: string) {}

  async completeJson<T>(request: LlmCompletionRequest): Promise<T> {
    recordUsage("llm");
    const model = request.model ?? config.llmModel;
    const toolName = request.schema.name;
    const body = {
      model,
      max_tokens: MAX_TOKENS,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
      tools: [
        {
          name: toolName,
          description: `Return the ${toolName} result as structured data matching the schema exactly.`,
          input_schema: request.schema.schema,
        },
      ],
      tool_choice: { type: "tool", name: toolName },
    };

    const response = await this.post(body);
    if (!response.ok) {
      const detail = await safeErrorDetail(response);
      throw new AnthropicHttpError(`Anthropic request failed (${response.status}): ${detail}`, response.status);
    }
    const json = (await response.json()) as AnthropicMessageResponse;
    const toolUse = json.content?.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.input === undefined) {
      throw new AnthropicHttpError("Anthropic returned no tool_use content.", 502);
    }
    return toolUse.input as T;
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

  private async post(body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AnthropicHttpError("Anthropic request timed out.", 0);
      }
      throw new AnthropicHttpError("Could not reach Anthropic. Check your connection and try again.", 0);
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
