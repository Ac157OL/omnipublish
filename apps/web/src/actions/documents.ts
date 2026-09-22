"use server";

import { prisma } from "@omnipublish/db";
import { auth } from "@/auth";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import matter from "gray-matter";
import { parseMarkdown, extractImages } from "@omnipublish/content-core";

function getHash(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function getDashboardStats() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [
    totalDocs,
    publishedDocs,
    recentJobs,
    failedJobs,
    recentDocs,
    recentTasks
  ] = await Promise.all([
    // 1. 文档总数
    prisma.document.count({
      where: { userId, deletedAt: null }
    }),

    // 2. 已发布文档数
    prisma.document.count({
      where: { userId, deletedAt: null, status: "published" }
    }),

    // 3. 本周发布次数
    prisma.publishJob.count({
      where: {
        batch: { document: { userId } },
        createdAt: {
          gte: new Date(new Date().setDate(new Date().getDate() - 7))
        }
      }
    }),

    // 4. 待处理失败任务
    prisma.publishJob.count({
      where: {
        batch: { document: { userId } },
        status: "failed"
      }
    }),

    // 5. 最近编辑的文档 (Top 5)
    prisma.document.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        _count: {
          select: { variants: true }
        }
      }
    }),

    // 6. 最近发布任务 (Top 5)
    prisma.publishJob.findMany({
      where: { batch: { document: { userId } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        createdAt: true,
        batch: {
          select: { document: { select: { title: true } } }
        }
      }
    })
  ]);

  return {
    stats: {
      totalDocs,
      publishedDocs,
      recentJobs,
      failedJobs
    },
    recentDocs,
    recentTasks
  };
}

export async function getDocuments() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return prisma.document.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getDocument(id: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return prisma.document.findUnique({
    where: { id, userId: session.user.id, deletedAt: null },
  });
}

export async function createDocument(title?: string, markdown: string = "") {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  let finalTitle = title;
  if (!finalTitle) {
    const existingDocs = await prisma.document.findMany({
      where: { userId: session.user.id, title: { startsWith: "未命名文档" }, deletedAt: null },
      select: { title: true }
    });

    let maxNum = 0;
    let hasBase = false;
    for (const doc of existingDocs) {
      if (doc.title === "未命名文档") hasBase = true;
      const match = doc.title.match(/^未命名文档\s*(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }

    if (maxNum > 0 || hasBase) {
      finalTitle = `未命名文档 ${maxNum > 0 ? maxNum + 1 : 1}`;
    } else {
      finalTitle = "未命名文档";
    }
  }

  const doc = await prisma.document.create({
    data: {
      userId: session.user.id,
      title: finalTitle,
      markdown,
      contentHash: getHash(markdown),
    },
  });

  revalidatePath("/dashboard/documents");
  return doc.id;
}

export async function renameDocument(id: string, title: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.document.update({
    where: { id, userId: session.user.id },
    data: { title },
  });

  revalidatePath("/dashboard/documents");
  revalidatePath(`/dashboard/documents/${id}`);
}

export async function updateDocument(id: string, markdown: string, title?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const hash = getHash(markdown);

  // Example of AST usage: Extract images when document is saved
  // You could use this later to auto-upload remote images to MinIO
  const ast = parseMarkdown(markdown);
  const images = extractImages(ast);

  await prisma.document.update({
    where: { id, userId: session.user.id },
    data: {
      markdown,
      title: title ?? undefined,
      contentHash: hash,
    },
  });

  revalidatePath("/dashboard/documents");
  revalidatePath(`/dashboard/documents/${id}`);
}

export async function deleteDocument(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.document.update({
    where: { id, userId: session.user.id },
    data: { deletedAt: new Date() },
  });

  revalidatePath("/dashboard/documents");
}

export async function importMarkdown(fileContent: string, fileName: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = matter(fileContent);
  const title = parsed.data.title || fileName.replace(/\.md$/, "") || "导入的文档";

  // We don't save parsed.data to frontMatter yet due to JSON serialization complexity in Server Actions
  const doc = await prisma.document.create({
    data: {
      userId: session.user.id,
      title,
      markdown: parsed.content,
      contentHash: getHash(parsed.content),
    },
  });

  revalidatePath("/dashboard/documents");
  return doc.id;
}
