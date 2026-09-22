const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clean() {
  try {
    console.log("Cleaning douyin records...");
    await prisma.$executeRawUnsafe(`DELETE FROM platform_accounts WHERE platform = 'douyin'`);
    await prisma.$executeRawUnsafe(`DELETE FROM platform_variants WHERE platform = 'douyin'`);
    console.log("Cleaned douyin records.");
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

clean();