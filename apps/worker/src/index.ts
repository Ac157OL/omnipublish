import * as path from 'node:path';
import * as dotenv from 'dotenv';
// worker may be started from a different cwd (tsx watch, prod node, IDE).
// Load .env from the monorepo root explicitly.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { Worker } from 'bullmq';
import { connection, PUBLISH_QUEUE_NAME } from '@omnipublish/queue';
import { decryptCredentials, prisma } from '@omnipublish/db';
import { WechatAdapter, CnblogsAdapter, JuejinAdapter, XiaohongshuAdapter, ZhihuAdapter, CSDNAdapter, PlatformAdapter } from '@omnipublish/platform-sdk';
import { startMetricCrawlerWorker } from './metric-crawler';
// import './bind-worker'; // Disabled because we use cookie binding now

startMetricCrawlerWorker();

console.log("OmniPublish Worker started. Waiting for jobs...");

const worker = new Worker(PUBLISH_QUEUE_NAME, async (job) => {
  console.log(`[Job ${job.id}] Started processing...`);
  const { publishJobId } = job.data;

  // 1. Load job details
  const publishJob = await prisma.publishJob.findUnique({
    where: { id: publishJobId },
    include: { batch: true, platformAccount: true }
  });

  if (!publishJob) throw new Error(`Publish job ${publishJobId} not found`);

  // 2. Mark as submitting
  await prisma.publishJob.update({
    where: { id: publishJobId },
    data: { status: 'submitting' }
  });

  try {
    // 3. Select the correct adapter based on platform account
    let adapter: PlatformAdapter;
    const platform = publishJob.platformAccount.platform;
    const creds = decryptCredentials<Record<string, string>>(
      publishJob.platformAccount.encryptedCredentials,
    );

    if (platform === 'wechat') {
      adapter = new WechatAdapter({ appId: creds.appId, appSecret: creds.appSecret });
    } else if (platform === 'cnblogs') {
      adapter = new CnblogsAdapter({
        blogApp: creds.blogApp,
        username: creds.username,
        password: creds.password,
        sourceName: creds.sourceName,
      });
    } else if (platform === 'juejin') {
      adapter = new JuejinAdapter({ sessionToken: creds.sessionToken, headless: true });
    } else if (platform === 'xiaohongshu') {
      adapter = new XiaohongshuAdapter({ sessionToken: creds.sessionToken, headless: true });
    } else if (platform === 'zhihu') {
      adapter = new ZhihuAdapter({ sessionToken: creds.sessionToken, headless: true });
    } else if (platform === 'csdn') {
      adapter = new CSDNAdapter({ sessionToken: creds.sessionToken, headless: true });
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // Check readiness
    const isReady = await adapter.isReady();
    if (!isReady) {
      throw new Error(`Adapter for ${platform} is not properly configured or missing credentials.`);
    }

    // 4. Adapt content (e.g. Markdown -> HTML for WeChat)
    const snapshot = (publishJob.variantSnapshot as any) || {};

    // We must pass the publishAction from the database record down to the adapter
    // publishAction is stored inside variantSnapshot JSON payload from the frontend
    const isDirectPublish = snapshot.publishAction === 'direct';

    const context = await adapter.adaptContent({
      title: snapshot.title || "",
      markdown: snapshot.markdown || "",
      tags: [] as string[],
      publishAction: isDirectPublish ? 'direct' : 'draft',
      platformConfig: {},
    });

    // 5. Execute publish
    const result = await adapter.publish(context);

    // 6. Record result
    let finalStatus = result.success ? 'published' : 'failed';
    if (result.success && result.isAwaitingUser) {
      finalStatus = 'awaiting_user';
    }

    await prisma.publishJob.update({
      where: { id: publishJobId },
      data: {
        status: finalStatus as any,
        remoteId: result.remoteId,
        remoteUrl: result.remoteUrl,
        errorMessage: result.errorMessage,
        errorCode: result.errorCode,
        finishedAt: finalStatus === 'awaiting_user' ? null : new Date()
      }
    });

    console.log(`[Job ${job.id}] Finished. Success: ${result.success}`);
    if (!result.success) {
      console.log(`[Job ${job.id}] Error Message from Adapter: ${result.errorMessage || 'No error message provided'}`);
    }
  } catch (error: any) {
    await prisma.publishJob.update({
      where: { id: publishJobId },
      data: {
        status: 'failed',
        errorMessage: error.message,
        finishedAt: new Date()
      }
    });
    console.error(`[Job ${job.id}] Failed with exception: ${error.message}`);
    throw error; // Let BullMQ know it failed
  }
}, { connection });

worker.on('completed', job => {
  console.log(`[BullMQ] Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.log(`[BullMQ] Job ${job?.id} failed: ${err.message}`);
});
