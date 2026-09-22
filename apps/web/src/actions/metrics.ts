"use server";

import { auth } from "@/auth";
import { prisma } from "@omnipublish/db";

export interface MetricSeriesPoint {
  capturedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface MetricJobRow {
  publishJobId: string;
  platform: string;
  remoteUrl: string | null;
  title: string;
  snapshots: MetricSeriesPoint[];
  latest: { views: number; likes: number; comments: number; shares: number };
}

export async function getMetricsOverview(): Promise<MetricJobRow[]> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("未登录");
  }

  const jobs = await prisma.publishJob.findMany({
    where: { status: "published", remoteId: { not: null } },
    include: {
      platformAccount: { select: { platform: true } },
      batch: {
        select: {
          document: { select: { title: true } },
        },
      },
      metricSnapshots: {
        orderBy: { capturedAt: "asc" },
        take: 200,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return jobs.map((job) => {
    const snapshots: MetricSeriesPoint[] = job.metricSnapshots.map((s) => ({
      capturedAt: s.capturedAt.toISOString(),
      views: s.views,
      likes: s.likes,
      comments: s.comments,
      shares: s.shares,
    }));
    const latest = snapshots.length
      ? snapshots[snapshots.length - 1]
      : { views: 0, likes: 0, comments: 0, shares: 0 };
    return {
      publishJobId: job.id,
      platform: job.platformAccount.platform,
      remoteUrl: job.remoteUrl,
      title: job.batch?.document?.title ?? "(未命名)",
      snapshots,
      latest: {
        views: latest.views,
        likes: latest.likes,
        comments: latest.comments,
        shares: latest.shares,
      },
    };
  });
}

export interface MetricTotalRow {
  platform: string;
  jobs: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
}

export async function getMetricsTotals(): Promise<MetricTotalRow[]> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("未登录");
  }

  // Per-platform latest-snapshot sums. We group by platform and pick the
  // most recent snapshot per job inside that platform.
  const rows = await prisma.publishJob.findMany({
    where: { status: "published" },
    include: {
      platformAccount: { select: { platform: true } },
      metricSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
    },
  });

  const map = new Map<string, MetricTotalRow>();
  for (const job of rows) {
    const platform = job.platformAccount.platform;
    const latest = job.metricSnapshots[0];
    if (!latest) continue;
    const row = map.get(platform) ?? {
      platform,
      jobs: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
    };
    row.jobs += 1;
    row.totalViews += latest.views;
    row.totalLikes += latest.likes;
    row.totalComments += latest.comments;
    row.totalShares += latest.shares;
    map.set(platform, row);
  }

  return Array.from(map.values()).sort((a, b) => b.totalViews - a.totalViews);
}
