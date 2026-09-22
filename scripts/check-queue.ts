import { publishQueue } from '../packages/queue/src/index';

async function main() {
  const failed = await publishQueue.getFailed();

  console.log(`Failed: ${failed.length}`);

  for (const job of failed) {
    console.log(`Failed Job ID: ${job.id}, Name: ${job.name}, Error: ${job.failedReason}`);
  }
  process.exit(0);
}
main();