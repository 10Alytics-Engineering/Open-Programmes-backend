const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const transactions = await prisma.paystackTransaction.findMany({
    take: 5,
    include: {
      paymentStatus: {
        include: {
          user: true,
          course: true
        }
      }
    }
  });
  console.log(JSON.stringify(transactions, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
