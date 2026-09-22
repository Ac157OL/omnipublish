import { PrismaClient } from '../packages/db/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.publishJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { platformAccount: true }
  });
  console.log("Recent Publish Jobs:");
  for (const job of jobs) {
    console.log(`Job ID: ${job.id}, Platform: ${job.platformAccount?.platform}, Status: ${job.status}, Error: ${job.errorMessage}`);
  }
  process.exit(0);
}
main();