import {
  AIError,
  type AIErrorCode,
  type MiniMaxClientOptions,
  type MiniMaxImageResponse,
} from "./types";

const DEFAULT_BASE_URL = "https://api.minimaxi.com";
const DEFAULT_MODEL = "image-dream-01";
const DEFAULT_TIMEOUT_MS = 120000; // 120s timeout
const DEFAULT_MAX_RETRIES = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface GenerateImageParams {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  n?: number;
}

export class MiniMaxClient {
  private readonly apiKey: string;
  private readonly groupId?: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MiniMaxClientOptions) {
    if (!options.apiKey) {
      throw new AIError("AI_AUTH_ERROR", "MiniMax API key is required");
    }
    this.apiKey = options.apiKey;
    this.groupId = options.groupId;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.model = options.model ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getModel(): string {
    return this.model;
  }

  async generateImage(params: GenerateImageParams): Promise<MiniMaxImageResponse> {
    let lastError: AIError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.callOnce(params);
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

  private async callOnce(params: GenerateImageParams): Promise<MiniMaxImageResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = this.groupId
        ? `${this.baseUrl}/v1/image_generation?GroupId=${this.groupId}`
        : `${this.baseUrl}/v1/image_generation`;

      // Minimax image-01 requires specific parameters
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "image-01",
          prompt: params.prompt,
          response_format: "base64"
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
          `MiniMax API ${response.status}: ${text.slice(0, 200)}`,
          RETRYABLE_STATUS.has(response.status),
        );
      }

      const data = (await response.json()) as any;

      // Handle base_resp error if exists
      if (data.base_resp && data.base_resp.status_code !== 0) {
        throw new AIError(
          "AI_INVALID_RESPONSE",
          `MiniMax API Error: ${data.base_resp.status_msg}`,
          false
        );
      }

      // Parse the new image_base64 format
      if (data.data && data.data.image_base64 && data.data.image_base64.length > 0) {
        return {
          id: data.id || "minimax_" + Date.now(),
          created: Date.now(),
          data: {
            images: [{
              image_url: "data:image/jpeg;base64," + data.data.image_base64[0]
            }]
          }
        } as unknown as MiniMaxImageResponse;
      }

      if (data.base64_data && data.base64_data.length > 0) {
        return {
          id: data.id || "minimax_" + Date.now(),
          created: Date.now(),
          data: {
            images: [{
              image_url: "data:image/jpeg;base64," + data.base64_data[0]
            }]
          }
        } as unknown as MiniMaxImageResponse;
      }

      const first = data.data?.images?.[0];
      const hasUrl = !!first && "image_url" in first && first.image_url;
      if (!hasUrl) {
        throw new AIError("AI_INVALID_RESPONSE", "No image url in response", false);
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
