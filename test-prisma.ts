import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.course.count();
  console.log(`Course count: ${count}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
