export interface LlmJsonSchema {
  /** Short machine name for the schema, required by OpenAI's json_schema response format. */
  name: string;
  schema: Record<string, unknown>;
}

export interface LlmCompletionRequest {
  system: string;
  user: string;
  schema: LlmJsonSchema;
  model?: string;
}

export type LlmProviderName = "openai" | "none" | "fake" | "empty";

export interface LlmClient {
  readonly provider: LlmProviderName;
  completeJson<T>(request: LlmCompletionRequest): Promise<T>;
  /**
   * Optional second-pass repair call. Receives the original request plus the previous
   * (invalid) output and the reasons it failed validation, and should return a corrected
   * JSON value. Callers that omit this fall back to a plain completeJson retry with a
   * repair note appended to the user prompt.
   */
  critic?<T>(request: LlmCompletionRequest, previous: unknown, issues: string[]): Promise<T>;
}
