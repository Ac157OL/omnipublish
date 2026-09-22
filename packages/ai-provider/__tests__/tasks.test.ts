import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeepSeekClient } from "../src/client";
import {
  generateAITitle,
  generateAISummary,
  generateAITags,
} from "../src/tasks";
import { AIError } from "../src/types";

const SAMPLE_RESPONSE = {
  id: "test-id",
  choices: [
    {
      message: { role: "assistant" as const, content: "测试标题" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

function buildFetchResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function makePrismaMock(cached: { output: { text: string } } | null) {
  const findFirst = vi.fn().mockResolvedValue(cached);
  const create = vi.fn().mockResolvedValue({});
  return {
    instance: { aIGeneration: { findFirst, create } } as any,
    findFirst,
    create,
  };
}

function makeClient(fetchImpl: ReturnType<typeof vi.fn>, opts: { maxRetries?: number } = {}) {
  return new DeepSeekClient({
    apiKey: "test-key",
    model: "deepseek-chat-test",
    maxRetries: opts.maxRetries ?? 0,
    fetchImpl: fetchImpl as any,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("generateAITitle", () => {
  it("命中缓存时不调网络", async () => {
    const prisma = makePrismaMock({ output: { text: "缓存标题" } });
    const fetchImpl = vi.fn();
    const result = await generateAITitle(
      { client: makeClient(fetchImpl), prisma: prisma.instance as any, documentId: "doc-1" },
      "正文",
    );

    expect(result.success).toBe(true);
    expect(result.data).toBe("缓存标题");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prisma.create).not.toHaveBeenCalled();
  });

  it("未命中走网络成功并写入缓存", async () => {
    const prisma = makePrismaMock(null);
    const fetchImpl = vi.fn().mockResolvedValueOnce(buildFetchResponse(200, SAMPLE_RESPONSE));

    const result = await generateAITitle(
      { client: makeClient(fetchImpl), prisma: prisma.instance as any, documentId: "doc-1" },
      "正文",
    );

    expect(result.success).toBe(true);
    expect(result.data).toBe("测试标题");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(prisma.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "success",
          provider: "deepseek",
          model: "deepseek-chat-test",
          taskType: "title",
        }),
      }),
    );
  });

  it("401 鉴权错误立即失败并写 failed", async () => {
    const prisma = makePrismaMock(null);
    const fetchImpl = vi.fn().mockResolvedValue(buildFetchResponse(401, "Unauthorized"));

    const result = await generateAITitle(
      { client: makeClient(fetchImpl, { maxRetries: 3 }), prisma: prisma.instance as any, documentId: "doc-2" },
      "正文",
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("AI_AUTH_ERROR");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(prisma.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });
});

describe("generateAISummary", () => {
  it("网络成功", async () => {
    const prisma = makePrismaMock(null);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        buildFetchResponse(200, {
          ...SAMPLE_RESPONSE,
          choices: [
            { message: { role: "assistant", content: "这是摘要" }, finish_reason: "stop" },
          ],
        }),
      );

    const result = await generateAISummary(
      { client: makeClient(fetchImpl), prisma: prisma.instance as any, documentId: "doc-3" },
      "正文",
    );

    expect(result.success).toBe(true);
    expect(result.data).toBe("这是摘要");
  });
});

describe("generateAITags", () => {
  it("解析逗号分隔的标签", async () => {
    const prisma = makePrismaMock(null);
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      buildFetchResponse(200, {
        ...SAMPLE_RESPONSE,
        choices: [
          { message: { role: "assistant", content: "React,TypeScript,Next.js" }, finish_reason: "stop" },
        ],
      }),
    );

    const result = await generateAITags(
      { client: makeClient(fetchImpl), prisma: prisma.instance as any, documentId: "doc-4" },
      "正文",
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(["React", "TypeScript", "Next.js"]);
  });

  it("中文顿号分隔的标签", async () => {
    const prisma = makePrismaMock(null);
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      buildFetchResponse(200, {
        ...SAMPLE_RESPONSE,
        choices: [
          { message: { role: "assistant", content: "React、TypeScript、前端" }, finish_reason: "stop" },
        ],
      }),
    );

    const result = await generateAITags(
      { client: makeClient(fetchImpl), prisma: prisma.instance as any, documentId: "doc-5" },
      "正文",
    );

    expect(result.data).toEqual(["React", "TypeScript", "前端"]);
  });
});

describe("DeepSeekClient 重试", () => {
  it("429 限流可重试,退避后成功", async () => {
    vi.useRealTimers();
    const prisma = makePrismaMock(null);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(buildFetchResponse(429, "Rate limited"))
      .mockResolvedValueOnce(buildFetchResponse(200, SAMPLE_RESPONSE));

    const result = await generateAITitle(
      { client: makeClient(fetchImpl, { maxRetries: 3 }), prisma: prisma.instance as any, documentId: "doc-6" },
      "正文",
    );

    expect(result.success).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("超时(AbortError)重试 maxRetries 次后失败", async () => {
    vi.useRealTimers();
    const prisma = makePrismaMock(null);
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const fetchImpl = vi.fn().mockRejectedValue(abortErr);

    const result = await generateAITitle(
      { client: makeClient(fetchImpl, { maxRetries: 2 }), prisma: prisma.instance as any, documentId: "doc-7" },
      "正文",
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("AI_TIMEOUT");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("AIError", () => {
  it("缺少 apiKey 抛 AUTH_ERROR", () => {
    expect(() => new DeepSeekClient({ apiKey: "" })).toThrow(AIError);
  });
});
