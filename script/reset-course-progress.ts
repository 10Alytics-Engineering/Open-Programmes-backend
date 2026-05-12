import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Resetting all course progress...");

  await prisma.$transaction([
    // completed/watched videos
    prisma.userProgress.deleteMany({
      where: {
        userId: "cmoacacaz00026odzalnsheau",
      },
    }),
    prisma.user.update({
      where: {
        id: "cmoacacaz00026odzalnsheau",
      },
      data: {
        ongoing_courses: [],
        completed_courses: [],
      },
    }),
  ]);

  // const test = await prisma.userProgress.findMany({
  //   where: {
  //     userId: "cmoacacaz00026odzalnsheau",
  //     courseId: "cmmtb9q7g000w8cs7kyepo71j",
  //   },
  // });

  // console.log(test);

  console.log("All course progress reset successfully.");
}

main()
  .catch((error) => {
    console.error("Failed to reset course progress:", error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
