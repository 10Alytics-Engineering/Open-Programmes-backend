import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Resetting all course progress...");

  // await prisma.$transaction([
  //   // completed/watched videos
  //   prisma.userProgress.deleteMany({
  //     where: {
  //       userId: {
  //         in: [
  //           "cmoacacaz00026odzalnsheau",
  //           // "cmp3z4y2h000cbhe58boegtiv",
  //           // "cmows6g0o007oz4i0875ifdm5",
  //         ],
  //       },
  //     },
  //   }),
  //   prisma.user.updateMany({
  //     where: {
  //       id: {
  //         in: [
  //           "cmoacacaz00026odzalnsheau",
  //           // "cmp3z4y2h000cbhe58boegtiv",
  //           // "cmows6g0o007oz4i0875ifdm5",
  //         ],
  //       },
  //     },
  //     data: {
  //       ongoing_courses: [],
  //       completed_courses: [],
  //     },
  //   }),
  // ]);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const test = await prisma.userProgress.findMany({
    where: {
      userId: {
        in: [
          "cmoacacaz00026odzalnsheau",
          // "cmp3z4y2h000cbhe58boegtiv",
          // "cmows6g0o007oz4i0875ifdm5",
        ],
      },
    },
  });

  console.log({ test });

  console.log("All course progress reset successfully.");
}

main()
  .catch((error) => {
    console.error("Failed to reset course progress:", error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
