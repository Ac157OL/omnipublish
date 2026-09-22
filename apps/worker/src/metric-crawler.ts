import { Worker } from 'bullmq';
import { decryptCredentials, prisma } from '@omnipublish/db';
import {
  connection,
  METRIC_QUEUE_NAME,
  metricQueue,
  METRIC_RECRAWL_CRON,
} from '@omnipublish/queue';
import {
  WechatAdapter,
  JuejinAdapter,
  type PlatformAdapter,
} from '@omnipublish/platform-sdk';

const REPEAT_JOB_KEY = 'metric-recrawl-sweep';

// Bootstrap: register a recurring sweep job via upsertJobScheduler.
// Idempotent — calling it again with the same key updates the schedule
// instead of creating duplicates, which is safe under tsx watch reloads.
export async function scheduleSweep() {
  await metricQueue.upsertJobScheduler(
    REPEAT_JOB_KEY,
    { pattern: METRIC_RECRAWL_CRON },
    {
      name: REPEAT_JOB_KEY,
      data: { kind: 'sweep' },
      opts: { removeOnComplete: 100, removeOnFail: 100 },
    },
  );
  console.log(`[metric-crawler] scheduled sweep with cron "${METRIC_RECRAWL_CRON}"`);
}

export function startMetricCrawlerWorker() {
  const worker = new Worker(
    METRIC_QUEUE_NAME,
    async (job) => {
      const kind = job.data?.kind;
      if (kind === 'sweep') {
        await runSweep();
      } else if (kind === 'recrawl') {
        await recrawlOne(job.data.publishJobId);
      }
    },
    { connection, concurrency: 4 },
  );

  worker.on('completed', (j) => {
    console.log(`[metric-crawler] job ${j?.id} (${j?.data?.kind}) completed`);
  });
  worker.on('failed', (j, err) => {
    console.log(`[metric-crawler] job ${j?.id} failed: ${err.message}`);
  });

  scheduleSweep().catch((err) => {
    console.error('[metric-crawler] failed to schedule sweep:', err);
  });

  console.log('OmniPublish metric-crawler worker started.');
  return worker;
}

function selectAdapter(platform: string, creds: Record<string, string>): PlatformAdapter | null {
  if (platform === 'wechat') {
    return new WechatAdapter({ appId: creds.appId, appSecret: creds.appSecret });
  }
  if (platform === 'juejin') {
    return new JuejinAdapter({ sessionToken: creds.sessionToken, headless: true });
  }
  return null;
}

async function runSweep() {
  const jobs = await prisma.publishJob.findMany({
    where: { status: 'published', remoteId: { not: null } },
    include: { platformAccount: true },
    take: 200,
  });

  let enqueued = 0;
  for (const job of jobs) {
    await metricQueue.add(
      'recrawl-one',
      { kind: 'recrawl', publishJobId: job.id },
      { removeOnComplete: 200, removeOnFail: 200 },
    );
    enqueued++;
  }
  console.log(`[metric-crawler] sweep enqueued ${enqueued} jobs for recrawl`);
}

async function recrawlOne(publishJobId: string) {
  const job = await prisma.publishJob.findUnique({
    where: { id: publishJobId },
    include: { platformAccount: true },
  });
  if (!job || job.status !== 'published' || !job.remoteId) {
    return;
  }

  let creds: Record<string, string> = {};
  try {
    creds = decryptCredentials<Record<string, string>>(
      job.platformAccount.encryptedCredentials,
    );
  } catch (e) {
    console.warn(`[metric-crawler] Failed to decrypt credentials for ${job.platformAccount.platform}.`);
  }

  const adapter = selectAdapter(
    job.platformAccount.platform,
    creds,
  );
  if (!adapter || !adapter.fetchMetrics) {
    return; // platform doesn't support metric retrieval
  }

  const result = await adapter.fetchMetrics({
    remoteId: job.remoteId,
    remoteUrl: job.remoteUrl,
  });

  if (!result.success) {
    console.warn(
      `[metric-crawler] recrawl failed for ${publishJobId}: ${result.errorMessage}`,
    );
    return;
  }

  await prisma.metricSnapshot.create({
    data: {
      publishJobId: job.id,
      views: result.views ?? 0,
      likes: result.likes ?? 0,
      comments: result.comments ?? 0,
      shares: result.shares ?? 0,
    },
  });
}
