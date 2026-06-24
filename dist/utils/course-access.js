"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCourseAccess = void 0;
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
//# sourceMappingURL=course-access.js.map