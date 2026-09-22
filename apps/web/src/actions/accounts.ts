"use server";

import { encryptCredentials, prisma } from "@omnipublish/db";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

import { PlatformCode } from "@omnipublish/db";

// We'll reuse the publishQueue for binding jobs, or create a specific queue if needed.
// For now, let's use the existing Redis connection to trigger the worker.
import { Queue } from "bullmq";
import { connection as redisConnection } from "@omnipublish/queue";

const bindQueue = new Queue("bind-account", { connection: redisConnection });

export async function saveApiAccount(platform: string, displayName: string, creds: any) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const encryptedCredentials = encryptCredentials(creds);
  const uniqueDisplayName = `${displayName} (${new Date().toLocaleTimeString()})`;

  await prisma.platformAccount.create({
    data: {
      userId: session.user.id,
      platform: platform as PlatformCode,
      displayName: uniqueDisplayName,
      authType: "app_secret",
      encryptedCredentials,
      status: "active" // This ensures that manually added cookie accounts go straight to 'active'
    }
  });

  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function triggerBrowserBinding(platform: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const displayName = platform === "juejin" ? "掘金" : platform === "xiaohongshu" ? "小红书" : platform;
  const uniqueDisplayName = `${displayName} (${new Date().toLocaleTimeString()})`;

  const account = await prisma.platformAccount.create({
    data: {
      userId: session.user.id,
      platform: platform as PlatformCode,
      displayName: uniqueDisplayName,
      authType: "browser",
      encryptedCredentials: "{}",
      status: "binding" // New status indicating we are waiting for user to bind
    }
  });

  // Enqueue a job for the worker to open the browser
  await bindQueue.add("bind", {
    platformAccountId: account.id,
    platform: account.platform,
    userId: session.user.id
  });

  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function getAccounts() {
  const session = await auth();
  if (!session?.user?.id) return [];

  return prisma.platformAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" }
  });
}

export async function deleteAccount(accountId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const account = await prisma.platformAccount.findUnique({
    where: { id: accountId }
  });

  if (!account || account.userId !== session.user.id) {
    throw new Error("Account not found or unauthorized");
  }

  // First delete associated MetricSnapshots that belong to PublishJobs of this account
  await prisma.metricSnapshot.deleteMany({
    where: {
      publishJob: {
        platformAccountId: accountId
      }
    }
  });

  // Then delete associated PublishJobs
  await prisma.publishJob.deleteMany({
    where: { platformAccountId: accountId }
  });

  // Also delete associated PlatformAssets if any
  await prisma.platformAsset.deleteMany({
    where: { platformAccountId: accountId }
  });

  // Finally delete the account itself
  await prisma.platformAccount.delete({
    where: { id: accountId }
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/publish");
  return { success: true };
}

export async function deletePlatformAccounts(platform: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Get all accounts to delete
  const accountsToDelete = await prisma.platformAccount.findMany({
    where: {
      userId: session.user.id,
      platform: platform as any
    },
    select: { id: true }
  });

  const accountIds = accountsToDelete.map(a => a.id);

  if (accountIds.length > 0) {
    // Delete metric snapshots
    await prisma.metricSnapshot.deleteMany({
      where: {
        publishJob: {
          platformAccountId: { in: accountIds }
        }
      }
    });

    // Delete publish jobs
    await prisma.publishJob.deleteMany({
      where: { platformAccountId: { in: accountIds } }
    });

    // Delete platform assets
    await prisma.platformAsset.deleteMany({
      where: { platformAccountId: { in: accountIds } }
    });

    // Delete accounts
    await prisma.platformAccount.deleteMany({
      where: { id: { in: accountIds } }
    });
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/publish");
  return { success: true };
}
