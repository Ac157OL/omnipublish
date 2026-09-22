import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

// Use the environment variable or fallback to localhost
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

export const PUBLISH_QUEUE_NAME = 'publish-queue';
export const METRIC_QUEUE_NAME = 'metric-recrawl-queue';

export const publishQueue = new Queue(PUBLISH_QUEUE_NAME, { connection });
export const metricQueue = new Queue(METRIC_QUEUE_NAME, { connection });

// Default cadence for the metric recrawl sweep. Override via env in tests.
export const METRIC_RECRAWL_CRON = process.env.METRIC_RECRAWL_CRON || '0 * * * *';

export { Worker, QueueEvents };
