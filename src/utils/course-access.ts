import { prismadb } from "../lib/prismadb";

export const getCourseAccess = async ({
  userId,
  email,
  courseId,
}: {
  userId: string;
  email?: string | null;
  courseId: string;
}) => {
  const cleanedEmail = email?.toLowerCase().trim();

  const [purchase, freeRegistration] = await Promise.all([
    prismadb.purchase.findFirst({
      where: {
        userId,
        courseId,
      },
    }),

    prismadb.freeCourseAccessRegistration.findFirst({
      where: {
        courseId,
        accessGranted: true,
        OR: [{ userId }, ...(cleanedEmail ? [{ email: cleanedEmail }] : [])],
      },
    }),
  ]);

  return {
    hasPaidAccess: !!purchase,
    hasFreeAccess: !!freeRegistration,
    accessType: purchase ? "PAID" : freeRegistration ? "FREE" : "NONE",
  };
};

export const refreshCourseFreeAccessStatus = async (
  tx: any,
  courseId: string,
) => {
  const [freeModulesCount, freeVideosCount] = await Promise.all([
    tx.module.count({
      where: {
        isFree: true,
        CourseWeek: {
          courseId,
        },
      },
    }),

    tx.projectVideo.count({
      where: {
        isFree: true,
        courseId,
      },
    }),
  ]);

  await tx.course.update({
    where: {
      id: courseId,
    },
    data: {
      hasFreeModules: freeModulesCount > 0 || freeVideosCount > 0,
    },
  });
};
