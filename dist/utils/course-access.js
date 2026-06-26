"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshCourseFreeAccessStatus = exports.getCourseAccess = void 0;
const prismadb_1 = require("../lib/prismadb");
const getCourseAccess = async ({ userId, email, courseId, }) => {
    const cleanedEmail = email?.toLowerCase().trim();
    const [purchase, freeRegistration] = await Promise.all([
        prismadb_1.prismadb.purchase.findFirst({
            where: {
                userId,
                courseId,
            },
        }),
        prismadb_1.prismadb.freeCourseAccessRegistration.findFirst({
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
exports.getCourseAccess = getCourseAccess;
const refreshCourseFreeAccessStatus = async (tx, courseId) => {
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
exports.refreshCourseFreeAccessStatus = refreshCourseFreeAccessStatus;
//# sourceMappingURL=course-access.js.map