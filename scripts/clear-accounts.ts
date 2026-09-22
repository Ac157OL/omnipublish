import { PrismaClient } from '../packages/db/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Deleting old PlatformAccount data...');
  await prisma.metricSnapshot.deleteMany({});
  await prisma.publishJob.deleteMany({});
  await prisma.platformAsset.deleteMany({});
  const result = await prisma.platformAccount.deleteMany({});
  console.log(`Deleted ${result.count} platform accounts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });