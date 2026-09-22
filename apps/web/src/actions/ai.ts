"use server";

import { auth } from "@/auth";
import { prisma } from "@omnipublish/db";
import { revalidatePath } from "next/cache";
import {
  DeepSeekClient,
  MiniMaxClient,
  generateAITitle,
  generateAISummary,
  generateAITags,
  generateCoverBackground,
  generateAIStoryboard,
  type PrismaDelegate,
} from "@omnipublish/ai-provider";
import { s3Client } from "@/lib/s3";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

const BUCKET = process.env.S3_BUCKET?.replace(/"/g, "") || "omnipublish";

export interface AIBlendResult {
  title?: { success: boolean; data?: string; errorMessage?: string; errorCode?: string };
  summary?: { success: boolean; data?: string; errorMessage?: string; errorCode?: string };
  tags?: { success: boolean; data?: string[]; errorMessage?: string; errorCode?: string };
}

function makeClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.replace(/"/g, "");
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未配置");
  }
  return new DeepSeekClient({
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL?.replace(/"/g, "") || undefined,
    model: process.env.DEEPSEEK_MODEL?.replace(/"/g, "") || undefined,
    maxRetries: 3,
    timeoutMs: 60000,
  });
}

export async function generateAIBlend(
  documentId: string,
  tasks: { title?: boolean; summary?: boolean; tags?: boolean } = { title: true, summary: true, tags: true },
): Promise<AIBlendResult> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("未登录");
  }

  const doc = await prisma.document.findUnique({
    where: { id: documentId, userId: session.user.id },
    select: { id: true, markdown: true },
  });

  if (!doc) {
    throw new Error("文档不存在或无权访问");
  }

  if (!doc.markdown.trim()) {
    throw new Error("文档内容为空,无法生成");
  }

  const client = makeClient();
  const opts = { client, prisma: prisma as unknown as PrismaDelegate, documentId: doc.id };
  const result: AIBlendResult = {};

  if (tasks.title) {
    result.title = await generateAITitle(opts, doc.markdown);
  }
  if (tasks.summary) {
    result.summary = await generateAISummary(opts, doc.markdown);
  }
  if (tasks.tags) {
    result.tags = await generateAITags(opts, doc.markdown);
  }

  return result;
}

export async function applyAIBlendToVariant(
  documentId: string,
  platform: "wechat" | "juejin",
  data: { title?: string; summary?: string; tags?: string[] },
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("未登录");
  }

  const doc = await prisma.document.findUnique({
    where: { id: documentId, userId: session.user.id },
    select: { id: true },
  });
  if (!doc) {
    throw new Error("文档不存在或无权访问");
  }

  const latestVersion = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNo: "desc" },
  });
  if (!latestVersion) {
    throw new Error("文档还没有版本快照,请先保存");
  }

  return prisma.platformVariant.upsert({
    where: { documentId_platform: { documentId, platform } },
    create: {
      documentId,
      platform,
      sourceVersionId: latestVersion.id,
      title: data.title ?? "",
      summary: data.summary,
      tags: data.tags,
      bodyFormat: "markdown",
    },
    update: {
      title: data.title ?? undefined,
      summary: data.summary,
      tags: data.tags,
    },
  });
}

function makeMiniMaxClient() {
  const apiKey = process.env.MINIMAX_API_KEY?.replace(/"/g, "");
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY 未配置");
  }
  return new MiniMaxClient({
    apiKey,
    groupId: process.env.MINIMAX_GROUP_ID?.replace(/"/g, "") || undefined,
    baseUrl: process.env.MINIMAX_BASE_URL?.replace(/"/g, "") || undefined,
    model: process.env.MINIMAX_IMAGE_MODEL?.replace(/"/g, "") || undefined,
    maxRetries: 3,
    timeoutMs: 120000,
  });
}

export async function enhanceDocumentContent(documentId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const doc = await prisma.document.findUnique({
    where: { id: documentId, userId: session.user.id }
  });

  if (!doc) throw new Error("Document not found");

  const client = makeClient();

  // 1. Ask DeepSeek to expand the text and suggest image placements
  const prompt = `
你是一个专业的新媒体爆款内容主编。请你根据下面这份极简的草稿内容，将其扩写为一篇适合多平台发布的丰富长文。
同时，在文章中你认为需要配图的段落，请插入一个图片占位符，并用一段话描述这张图的画面内容，以便后续由AI绘画模型生成。
占位符格式严格为： [AI_IMAGE_PROMPT: 这里是详细的英文画面描述，用于生成图片，要求画面精美、有质感]

示例输出：
今天天气真好，我去了公园。
[AI_IMAGE_PROMPT: A sunny day in a beautiful park, lush green trees, people relaxing on the grass, cinematic lighting, highly detailed]
公园里的花都开了，特别美。

请对以下内容进行扩充和配图占位：
${doc.markdown}
`;

  // Note: We bypass the cache for this because the user might want to re-roll
  // For production, you could implement a separate task type for it.
  const response = await client.chat([{
    role: "user",
    content: prompt
  }]);

  let enrichedMarkdown = response.choices[0].message.content;

    // Extract image prompts and generate images using MiniMax
  // First, check if the string contains parentheses like (AI_IMAGE_PROMPT: ...)
  // Deepseek sometimes uses parentheses instead of brackets.
  let promptRegex = /\[AI_IMAGE_PROMPT:\s*(.*?)\]/g;
  if (!promptRegex.test(enrichedMarkdown)) {
     promptRegex = /\(AI_IMAGE_PROMPT:\s*(.*?)\)/g;
  }
  // Reset lastIndex just in case
  promptRegex.lastIndex = 0;

  let match;
  const imagePromises: { matchStr: string, promise: Promise<string> }[] = [];

  const minimaxClient = makeMiniMaxClient();

  while ((match = promptRegex.exec(enrichedMarkdown)) !== null) {
    const matchStr = match[0];
    const imagePrompt = match[1];

    console.log(">>> [AI ACTION] Generated Image Prompt by DeepSeek:", imagePrompt);

    if (!imagePrompt) {
      imagePromises.push({ matchStr, promise: Promise.resolve(`\n> (图片生成失败: DeepSeek 未能生成 Prompt)\n`) });
      continue;
    }

    // Call MiniMax for each image
    const promise = minimaxClient.generateImage({
      prompt: imagePrompt,
    }).then(async (res) => {
      // res.data.base64 is the field provided by minimax for image data
      if (res.data && res.data.images && res.data.images.length > 0) {
        const firstImage = res.data.images[0];
        let base64Data = "";

        if ("base64" in firstImage) {
            base64Data = firstImage.base64;
        } else if ("image_url" in firstImage && firstImage.image_url.startsWith("data:")) {
            base64Data = firstImage.image_url.split(",")[1] ?? "";
        }

        if (!base64Data) return `\n> (图片生成失败)\n`;

        const imageUrl = `data:image/jpeg;base64,${base64Data}`;
        const isDataUrl = imageUrl.startsWith("data:");
        let buffer: Buffer;
        let mimeType = "image/jpeg";

        if (isDataUrl) {
          const base64 = imageUrl.split(",")[1] ?? "";
          buffer = Buffer.from(base64, "base64");
        } else {
          const resp = await fetch(imageUrl);
          if (!resp.ok) return `\n> (图片下载失败: ${resp.status})\n`;
          buffer = Buffer.from(await resp.arrayBuffer());
          mimeType = resp.headers.get("content-type") || mimeType;
        }

        const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
        const ext = mimeType.split("/")[1] || "jpeg";
        const storageKey = `users/${session.user?.id}/ai-gen-${uuidv4()}.${ext}`;
        // Ensure we always read the fresh process.env.S3_ENDPOINT
        const currentEndpoint = process.env.S3_ENDPOINT?.replace(/"/g, "") || "http://localhost:9000";
        const publicUrl = `${currentEndpoint}/${BUCKET}/${storageKey}`;

        // Ensure we use the internal URL for S3 client operations to bypass proxy/tunnel limits
        const internalS3Client = new S3Client({
          region: process.env.S3_REGION?.replace(/"/g, "") || "us-east-1",
          endpoint: "http://localhost:9000",
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID?.replace(/"/g, "") || "minio",
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.replace(/"/g, "") || "minio123",
          },
          forcePathStyle: true,
        });

        await internalS3Client.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: storageKey,
            Body: buffer,
            ContentType: mimeType,
          }),
        );

        // Create an asset record
        if (session.user?.id) {
          await prisma.asset.create({
            data: {
              userId: session.user.id,
              kind: "image",
              source: "ai",
              originalName: `ai-gen-${imagePrompt.slice(0, 20)}.jpeg`,
              mimeType,
              byteSize: BigInt(buffer.length),
              sha256,
              storageKey,
              publicUrl,
              metadata: { provider: "minimax", model: "image_generation" },
            },
          });
        }

        return `\n![AI生成的插图](${publicUrl})\n`;
      } else {
        return `\n> (图片生成失败)\n`;
      }
    }).catch(e => {
      console.error("MiniMax image generation failed:", e);
      return `\n> (图片生成失败)\n`;
    });

    imagePromises.push({ matchStr, promise });
  }

  // 3. Replace placeholders with generated images
  for (const item of imagePromises) {
    const replacement = await item.promise;
    enrichedMarkdown = enrichedMarkdown.replace(item.matchStr, replacement);
  }

  // 4. Save the enriched markdown back to the document
  await prisma.document.update({
    where: { id: documentId },
    data: { markdown: enrichedMarkdown }
  });

  revalidatePath(`/dashboard/documents/${documentId}`);
  return enrichedMarkdown;
}
export async function generateDocumentStoryboard(documentId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("未登录");

  const doc = await prisma.document.findUnique({
    where: { id: documentId, userId: session.user.id },
    select: { id: true, markdown: true }
  });
  if (!doc) throw new Error("文档不存在或无权访问");
  if (!doc.markdown.trim()) throw new Error("文档内容为空");

  const client = makeClient();
  const opts = { client, prisma: prisma as unknown as PrismaDelegate, documentId: doc.id };

  return generateAIStoryboard(opts, doc.markdown);
}

export interface CoverGenerationResult {
  success: boolean;
  assetId?: string;
  publicUrl?: string;
  errorMessage?: string;
  errorCode?: string;
}

export async function generateDocumentCover(
  documentId: string,
  options: {
    title?: string;
    summary?: string;
    tags?: string[];
    aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  } = {},
): Promise<CoverGenerationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("未登录");
  }

  const doc = await prisma.document.findUnique({
    where: { id: documentId, userId: session.user.id },
    select: { id: true, title: true, markdown: true },
  });
  if (!doc) {
    throw new Error("文档不存在或无权访问");
  }

  const client = makeMiniMaxClient();
  const opts = {
    client,
    prisma: prisma as unknown as PrismaDelegate,
    documentId: doc.id,
  };

  const context = {
    title: options.title ?? doc.title ?? "",
    summary: options.summary,
    tags: options.tags,
  };

  const result = await generateCoverBackground(opts, context, options.aspectRatio ?? "16:9");
  if (!result.success || !result.data) {
    return {
      success: false,
      errorMessage: result.errorMessage,
      errorCode: result.errorCode,
    };
  }

  // Download from MiniMax, re-upload to MinIO, register Asset.
  // MiniMax image URLs are short-lived; we persist them in our own object store.
  const imageUrl = result.data.imageUrl;
  const isDataUrl = imageUrl.startsWith("data:");
  let buffer: Buffer;
  let mimeType = "image/png";

  if (isDataUrl) {
    const base64 = imageUrl.split(",")[1] ?? "";
    buffer = Buffer.from(base64, "base64");
  } else {
    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      return {
        success: false,
        errorMessage: `下载封面失败: ${resp.status}`,
      };
    }
    buffer = Buffer.from(await resp.arrayBuffer());
    mimeType = resp.headers.get("content-type") || mimeType;
  }

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const ext = mimeType.split("/")[1] || "png";
  const storageKey = `users/${session.user.id}/ai-cover-${uuidv4()}.${ext}`;
  const currentEndpoint = process.env.S3_ENDPOINT?.replace(/"/g, "") || "http://localhost:9000";
  const publicUrl = `${currentEndpoint}/${BUCKET}/${storageKey}`;

  // Ensure we use the internal URL for S3 client operations to bypass proxy/tunnel limits
  const internalS3Client = new S3Client({
    region: process.env.S3_REGION?.replace(/"/g, "") || "us-east-1",
    endpoint: "http://localhost:9000",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID?.replace(/"/g, "") || "minio",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.replace(/"/g, "") || "minio123",
    },
    forcePathStyle: true,
  });

  await internalS3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  const existing = await prisma.asset.findUnique({
    where: { userId_sha256: { userId: session.user.id, sha256 } },
  });
  const asset =
    existing ??
    (await prisma.asset.create({
      data: {
        userId: session.user.id,
        kind: "image",
        source: "ai",
        originalName: `ai-cover-${doc.title || doc.id.slice(0, 8)}.png`,
        mimeType,
        byteSize: BigInt(buffer.length),
        sha256,
        storageKey,
        publicUrl,
        metadata: {
          prompt: result.data.prompt,
          model: result.data.model,
          provider: "minimax",
          documentId: doc.id,
        },
      },
    }));

  return {
    success: true,
    assetId: asset.id,
    publicUrl: asset.publicUrl,
  };
}
