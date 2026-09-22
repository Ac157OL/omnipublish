import {
  AIError,
  type AIErrorCode,
  type ChatCompletionResponse,
  type ChatMessage,
  type DeepSeekClientOptions,
} from "./types";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class DeepSeekClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DeepSeekClientOptions) {
    if (!options.apiKey) {
      throw new AIError("AI_AUTH_ERROR", "DeepSeek API key is required");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.model = options.model ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getModel(): string {
    return this.model;
  }

  async chat(messages: ChatMessage[]): Promise<ChatCompletionResponse> {
    let lastError: AIError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.callOnce(messages);
        return result;
      } catch (err) {
        const aiErr = toAIError(err);
        lastError = aiErr;
        if (!aiErr.retryable || attempt === this.maxRetries) {
          throw aiErr;
        }
        await sleep(backoffMs(attempt));
      }
    }
    throw lastError ?? new AIError("AI_UNKNOWN", "Unreachable");
  }

  private async callOnce(messages: ChatMessage[]): Promise<ChatCompletionResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const endpoint = this.baseUrl.endsWith('/v1')
        ? `${this.baseUrl}/chat/completions`
        : `${this.baseUrl}/v1/chat/completions`;

      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const code: AIErrorCode = RETRYABLE_STATUS.has(response.status)
          ? response.status === 429
            ? "AI_RATE_LIMITED"
            : "AI_NETWORK_ERROR"
          : response.status === 401
            ? "AI_AUTH_ERROR"
            : "AI_INVALID_RESPONSE";
        throw new AIError(
          code,
          `DeepSeek API ${response.status}: ${text.slice(0, 200)}`,
          RETRYABLE_STATUS.has(response.status),
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;
      if (!data.choices?.[0]?.message?.content) {
        throw new AIError("AI_INVALID_RESPONSE", "Empty choices in response", false);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }
}

function toAIError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return new AIError("AI_TIMEOUT", `Request timed out`, true);
    }
    return new AIError("AI_NETWORK_ERROR", err.message, true);
  }
  return new AIError("AI_UNKNOWN", String(err), false);
}

function backoffMs(attempt: number): number {
  const base = 500 * Math.pow(2, attempt);
  return base + Math.floor(Math.random() * 200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
