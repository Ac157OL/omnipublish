import crypto from "node:crypto";
import { DeepSeekClient } from "./client";
import { MiniMaxClient } from "./minimax-client";
import { buildPrompt, buildCoverPrompt } from "./prompts";
import {
  AIError,
  type AITaskType,
  type AIResult,
  type PrismaDelegate,
} from "./types";

const PROMPT_VERSION = "v1";

export interface AIProviderOptions {
  client: DeepSeekClient;
  prisma: PrismaDelegate;
  documentId: string;
}

export interface MiniMaxProviderOptions {
  client: MiniMaxClient;
  prisma: PrismaDelegate;
  documentId: string;
}

export async function generateAITitle(
  opts: AIProviderOptions,
  markdown: string,
): Promise<AIResult<string>> {
  return runWithCache(opts, "title", markdown, (raw) => raw.trim());
}

export async function generateAISummary(
  opts: AIProviderOptions,
  markdown: string,
): Promise<AIResult<string>> {
  return runWithCache(opts, "summary", markdown, (raw) => raw.trim());
}

export async function generateAITags(
  opts: AIProviderOptions,
  markdown: string,
): Promise<AIResult<string[]>> {
  return runWithCache(opts, "tags", markdown, parseTags);
}

export interface StoryboardSlide {
  page: number;
  role: "cover" | "content" | "summary";
  headline: string;
  body: string;
  visualPrompt: string;
}

export interface StoryboardResult {
  title: string;
  slides: StoryboardSlide[];
}

export async function generateAIStoryboard(
  opts: AIProviderOptions,
  markdown: string,
): Promise<AIResult<StoryboardResult>> {
  return runWithCache(opts, "storyboard", markdown, (raw) => {
    // Attempt to extract JSON if it's wrapped in markdown code blocks
    let jsonStr = raw.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const parsed = JSON.parse(jsonStr) as StoryboardResult;
    if (!parsed.title || !Array.isArray(parsed.slides)) {
      throw new Error("Invalid storyboard JSON structure");
    }
    return parsed;
  });
}

export interface CoverBackgroundResult {
  imageUrl: string;
  prompt: string;
  model: string;
}

export async function generateCoverBackground(
  opts: MiniMaxProviderOptions,
  context: { title: string; summary?: string; tags?: string[] },
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" = "16:9",
): Promise<AIResult<CoverBackgroundResult>> {
  const input = JSON.stringify(context);
  const inputHash = hashInput(input, "image", opts.client.getModel());
  const model = opts.client.getModel();

  const cached = await opts.prisma.aIGeneration.findFirst({
    where: { inputHash, taskType: "image", model, status: "success" },
    orderBy: { createdAt: "desc" },
  });

  if (cached?.output) {
    const cachedUrl = String(cached.output.imageUrl ?? "");
    if (cachedUrl) {
      return {
        success: true,
        data: {
          imageUrl: cachedUrl,
          prompt: String(cached.output.prompt ?? ""),
          model,
        },
      };
    }
  }
  const prompt = buildCoverPrompt(context);
  let result: AIResult<CoverBackgroundResult>;

  try {
    const resp = await opts.client.generateImage({ prompt, aspectRatio });
    const first = resp.data?.images?.[0];
    const imageUrl =
      first && "image_url" in first
        ? first.image_url
        : first && "base64" in first
          ? `data:image/png;base64,${first.base64}`
          : "";
    if (!imageUrl) {
      throw new AIError("AI_INVALID_RESPONSE", "Empty image url", false);
    }
    result = {
      success: true,
      data: { imageUrl, prompt, model },
      usage: { totalTokens: resp.usage?.total_tokens },
    };
  } catch (err) {
    const aiErr = err instanceof AIError ? err : new AIError("AI_UNKNOWN", String(err));
    await persistFailure(opts, "image", inputHash, aiErr, "minimax", model);
    return {
      success: false,
      errorCode: aiErr.code,
      errorMessage: aiErr.message,
    };
  }

  await persistSuccess(opts, "image", inputHash, result, "minimax", model, {
    imageUrl: result.data!.imageUrl,
    prompt,
  });
  return result;
}

async function runWithCache<T>(
  opts: AIProviderOptions,
  taskType: AITaskType,
  markdown: string,
  parse: (raw: string) => T,
): Promise<AIResult<T>> {
  const inputHash = hashInput(markdown, taskType, opts.client.getModel());
  const model = opts.client.getModel();

  const cached = await opts.prisma.aIGeneration.findFirst({
    where: { inputHash, taskType, model, status: "success" },
    orderBy: { createdAt: "desc" },
  });

  if (cached?.output) {
    return { success: true, data: parse(String(cached.output.text ?? "")) };
  }

  const { system, user } = buildPrompt(taskType, markdown);
  let result: AIResult<T>;

  try {
    const resp = await opts.client.chat([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    const text = resp.choices[0].message.content;
    result = {
      success: true,
      data: parse(text),
      usage: {
        promptTokens: resp.usage?.prompt_tokens,
        completionTokens: resp.usage?.completion_tokens,
        totalTokens: resp.usage?.total_tokens,
      },
    };
  } catch (err) {
    const aiErr = err instanceof AIError ? err : new AIError("AI_UNKNOWN", String(err));
    await persistFailure(opts, taskType, inputHash, aiErr, "deepseek", model);
    return {
      success: false,
      errorCode: aiErr.code,
      errorMessage: aiErr.message,
    };
  }

  await persistSuccess(opts, taskType, inputHash, result, "deepseek", model, {
    text: String(result.data),
  });
  return result;
}

async function persistSuccess<T>(
  opts: AIProviderOptions | MiniMaxProviderOptions,
  taskType: AITaskType,
  inputHash: string,
  result: AIResult<T>,
  provider: "deepseek" | "minimax",
  model: string,
  output: Record<string, unknown>,
) {
  return opts.prisma.aIGeneration.create({
    data: {
      documentId: opts.documentId,
      provider,
      model,
      taskType,
      promptVersion: PROMPT_VERSION,
      inputHash,
      requestMeta: {},
      output,
      usage: result.usage ?? {},
      status: "success",
    },
  });
}

async function persistFailure(
  opts: AIProviderOptions | MiniMaxProviderOptions,
  taskType: AITaskType,
  inputHash: string,
  err: AIError,
  provider: "deepseek" | "minimax",
  model: string,
) {
  return opts.prisma.aIGeneration.create({
    data: {
      documentId: opts.documentId,
      provider,
      model,
      taskType,
      promptVersion: PROMPT_VERSION,
      inputHash,
      requestMeta: {},
      output: null,
      usage: null,
      status: "failed",
    },
  });
}

function hashInput(input: string, taskType: AITaskType, model: string): string {
  return crypto
    .createHash("sha256")
    .update(`${taskType}|${model}|${PROMPT_VERSION}|${input}`)
    .digest("hex");
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[,，、\n]/)
    .map((t) => t.replace(/^#+\s*/, "").trim())
    .filter((t) => t.length > 0)
    .slice(0, 8);
}
