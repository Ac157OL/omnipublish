export type AITaskType = "title" | "summary" | "tags" | "image" | "storyboard";

export type AIProvider = "deepseek" | "minimax";

export interface AIResult<T = unknown> {
  success: boolean;
  data?: T;
  errorMessage?: string;
  errorCode?: AIErrorCode;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}
export type AIErrorCode =
  | "AI_TIMEOUT"
  | "AI_NETWORK_ERROR"
  | "AI_RATE_LIMITED"
  | "AI_AUTH_ERROR"
  | "AI_INVALID_RESPONSE"
  | "AI_UNKNOWN";

export interface DeepSeekClientOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export interface MiniMaxClientOptions {
  apiKey: string;
  groupId?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface MiniMaxImageResponse {
  id: string;
  data?: {
    images: Array<{ image_url: string } | { base64: string }>;
  };
  usage?: {
    total_tokens: number;
  };
  base_resp?: { status_code: number; status_msg: string };
}

export class AIError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIError";
  }
}

// PrismaDelegate is a minimal duck-typed subset of PrismaClient.
// Field types are intentionally permissive (string / Record) so that the
// real Prisma client — whose where-fields are enum unions — is assignable.
// The narrow taskType/provider/status enums live in the DB layer; here we
// only need shape compatibility, not value-level enum matching.
export interface AIGenerationDelegate {
  findFirst(args: {
    where: {
      inputHash: string;
      taskType: string;
      model: string;
      status: string;
    };
    orderBy: { createdAt: "desc" };
  }): Promise<{ output: Record<string, unknown> | null } | null>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
}

export interface AssetDelegate {
  findUnique(args: {
    where: { userId_sha256: { userId: string; sha256: string } };
  }): Promise<{ id: string; publicUrl: string } | null>;
  create(args: { data: Record<string, unknown> }): Promise<{ id: string; publicUrl: string }>;
}

export interface PrismaDelegate {
  aIGeneration: AIGenerationDelegate;
}

export interface PrismaWithAssetsDelegate extends PrismaDelegate {
  asset: AssetDelegate;
}
