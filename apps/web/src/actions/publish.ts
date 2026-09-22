"use server";

import { auth } from "@/auth";
import { encryptCredentials, prisma } from "@omnipublish/db";
import { publishQueue } from "@omnipublish/queue";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

function getHash(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function submitWechatPublishJob(documentId: string, appId: string, appSecret: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const doc = await prisma.document.findUnique({
    where: { id: documentId, userId: session.user.id }
  });

  if (!doc) throw new Error("Document not found");

  // 1. Get or Create Wechat Platform Account
  let wechatAccount = await prisma.platformAccount.findFirst({
    where: { userId: session.user.id, platform: "wechat" }
  });

  const creds = encryptCredentials({ appId, appSecret });

  if (!wechatAccount) {
    wechatAccount = await prisma.platformAccount.create({
      data: {
        userId: session.user.id,
        platform: "wechat",
        displayName: "微信公众号",
        authType: "app_secret",
        encryptedCredentials: creds,
        status: "active"
      }
    });
  } else {
    wechatAccount = await prisma.platformAccount.update({
      where: { id: wechatAccount.id },
      data: { encryptedCredentials: creds }
    });
  }

  // 2. Create Document Version (Snapshot)
  const latestVersion = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNo: "desc" }
  });
  const nextVersionNo = (latestVersion?.versionNo || 0) + 1;

  const version = await prisma.documentVersion.create({
    data: {
      documentId,
      versionNo: nextVersionNo,
      markdown: doc.markdown,
      contentHash: doc.contentHash || getHash(doc.markdown),
      source: "manual"
    }
  });

  // Create a publish batch
  const batch = await prisma.publishBatch.create({
    data: {
      documentId,
      sourceVersionId: version.id,
      status: "running"
    }
  });

  // Create a job for the wechat platform
  const job = await prisma.publishJob.create({
    data: {
      batchId: batch.id,
      platformAccountId: wechatAccount.id,
      mode: "api",
      status: "queued",
      idempotencyKey: `wechat_${batch.id}_${Date.now()}`,
      variantSnapshot: { title: doc.title, markdown: doc.markdown }
    }
  });

  // Delegate execution to BullMQ Worker
  await publishQueue.add('wechat-publish', { publishJobId: job.id });

  revalidatePath("/dashboard/publish");
  return batch.id;
}

export async function submitJuejinPublishJob(documentId: string, sessionToken: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const doc = await prisma.document.findUnique({
    where: { id: documentId, userId: session.user.id }
  });

  if (!doc) throw new Error("Document not found");

  const creds = encryptCredentials({ sessionToken });

  // 1. Get or Create Juejin Platform Account
  let juejinAccount = await prisma.platformAccount.findFirst({
    where: { userId: session.user.id, platform: "juejin" }
  });

  if (!juejinAccount) {
    juejinAccount = await prisma.platformAccount.create({
      data: {
        userId: session.user.id,
        platform: "juejin",
        displayName: "掘金",
        authType: "browser",
        encryptedCredentials: creds,
        status: "active"
      }
    });
  } else {
    juejinAccount = await prisma.platformAccount.update({
      where: { id: juejinAccount.id },
      data: { encryptedCredentials: creds }
    });
  }

  // 2. Create Document Version
  const latestVersion = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNo: "desc" }
  });
  const nextVersionNo = (latestVersion?.versionNo || 0) + 1;

  const version = await prisma.documentVersion.create({
    data: {
      documentId,
      versionNo: nextVersionNo,
      markdown: doc.markdown,
      contentHash: doc.contentHash || getHash(doc.markdown),
      source: "manual"
    }
  });

  // Create a publish batch
  const batch = await prisma.publishBatch.create({
    data: {
      documentId,
      sourceVersionId: version.id,
      status: "running"
    }
  });

  // Create a job for the juejin platform
  const job = await prisma.publishJob.create({
    data: {
      batchId: batch.id,
      platformAccountId: juejinAccount.id,
      mode: "browser",
      status: "queued",
      idempotencyKey: `juejin_${batch.id}_${Date.now()}`,
      variantSnapshot: { title: doc.title, markdown: doc.markdown }
    }
  });

  // Delegate execution to BullMQ Worker
  await publishQueue.add('juejin-publish', { publishJobId: job.id });

  revalidatePath("/dashboard/publish");
  return batch.id;
}

export async function submitXiaohongshuPublishJob(documentId: string, sessionToken: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const doc = await prisma.document.findUnique({
    where: { id: documentId, userId: session.user.id }
  });

  if (!doc) throw new Error("Document not found");

  const creds = encryptCredentials({ sessionToken });

  let xhsAccount = await prisma.platformAccount.findFirst({
    where: { userId: session.user.id, platform: "xiaohongshu" }
  });

  if (!xhsAccount) {
    xhsAccount = await prisma.platformAccount.create({
      data: {
        userId: session.user.id,
        platform: "xiaohongshu",
        displayName: "小红书",
        authType: "browser",
        encryptedCredentials: creds,
        status: "active"
      }
    });
  } else {
    xhsAccount = await prisma.platformAccount.update({
      where: { id: xhsAccount.id },
      data: { encryptedCredentials: creds }
    });
  }

  const latestVersion = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNo: "desc" }
  });
  const nextVersionNo = (latestVersion?.versionNo || 0) + 1;

  const version = await prisma.documentVersion.create({
    data: {
      documentId,
      versionNo: nextVersionNo,
      markdown: doc.markdown,
      contentHash: doc.contentHash || getHash(doc.markdown),
      source: "manual"
    }
  });

  const batch = await prisma.publishBatch.create({
    data: {
      documentId,
      sourceVersionId: version.id,
      status: "running"
    }
  });

  const job = await prisma.publishJob.create({
    data: {
      batchId: batch.id,
      platformAccountId: xhsAccount.id,
      mode: "browser",
      status: "queued",
      idempotencyKey: `xhs_${batch.id}_${Date.now()}`,
      variantSnapshot: { title: doc.title, markdown: doc.markdown }
    }
  });

  await publishQueue.add('xhs-publish', { publishJobId: job.id });

  revalidatePath("/dashboard/publish");
  return batch.id;
}

export async function submitUnifiedPublishJob(documentId: string, configs: { accountId: string, scheduledAt?: Date, publishAction?: 'draft' | 'direct' }[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const doc = await prisma.document.findUnique({
    where: { id: documentId, userId: session.user.id }
  });

  if (!doc) throw new Error("Document not found");
  if (!configs || configs.length === 0) throw new Error("No accounts selected");

  const accountIds = configs.map(c => c.accountId);

  // Verify accounts belong to user
  const accounts = await prisma.platformAccount.findMany({
    where: {
      id: { in: accountIds },
      userId: session.user.id
    }
  });

  if (accounts.length !== accountIds.length) {
    throw new Error("One or more accounts not found or unauthorized");
  }

  // 1. Create Document Version
  const latestVersion = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNo: "desc" }
  });
  const nextVersionNo = (latestVersion?.versionNo || 0) + 1;

  const version = await prisma.documentVersion.create({
    data: {
      documentId,
      versionNo: nextVersionNo,
      markdown: doc.markdown,
      contentHash: doc.contentHash || getHash(doc.markdown),
      source: "manual"
    }
  });

  // 2. Create a publish batch
  const batch = await prisma.publishBatch.create({
    data: {
      documentId,
      sourceVersionId: version.id,
      status: "running"
    }
  });

  // 3. Create jobs and enqueue
  for (const config of configs) {
    const account = accounts.find(a => a.id === config.accountId)!;

    const job = await prisma.publishJob.create({
      data: {
        batchId: batch.id,
        platformAccountId: account.id,
        mode: account.authType === "browser" ? "browser" : "api",
        status: "queued",
        idempotencyKey: `${account.platform}_${batch.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        variantSnapshot: { title: doc.title, markdown: doc.markdown, publishAction: config.publishAction || 'draft' }
      }
    });

    let jobName = "juejin-publish";
    if (account.platform === "wechat") jobName = "wechat-publish";
    else if (account.platform === "cnblogs") jobName = "cnblogs-publish";
    else if (account.platform === "juejin") jobName = "juejin-publish";
    else if (account.platform === "xiaohongshu") jobName = "xhs-publish";
    else if (account.platform === "zhihu") jobName = "zhihu-publish";
    else if (account.platform === "csdn") jobName = "csdn-publish";

    let delay = 0;
    if (config.scheduledAt) {
       const targetTime = new Date(config.scheduledAt).getTime();
       const now = Date.now();
       if (targetTime > now) {
         delay = targetTime - now;
       }
    }

    await publishQueue.add(jobName, { publishJobId: job.id }, { delay });
  }

  revalidatePath("/dashboard/publish");
  return batch.id;
}

export async function getRecentPublishJobs() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  return prisma.publishJob.findMany({
    where: {
      batch: { document: { userId: session.user.id } }
    },
    orderBy: { createdAt: "desc" },
    take: 10
  });
}

export async function deletePublishJob(jobId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const job = await prisma.publishJob.findUnique({
    where: { id: jobId },
    include: { batch: { include: { document: true } } }
  });

  if (!job || job.batch.document.userId !== session.user.id) {
    throw new Error("Job not found or unauthorized");
  }

  await prisma.publishJob.delete({
    where: { id: jobId }
  });

  revalidatePath("/dashboard/publish");
}
