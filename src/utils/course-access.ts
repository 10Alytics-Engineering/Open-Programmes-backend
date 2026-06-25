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
