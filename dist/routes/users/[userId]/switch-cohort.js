"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const prisma_1 = require("@/lib/prisma");
const email_1 = require("@/lib/email");
async function POST(request, { params }) {
    try {
        const { newCohortId, currentCohortId, courseId, reason } = await request.json();
        // Validate inputs
        if (!newCohortId || !currentCohortId || !courseId) {
            return server_1.NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }
        // Get user and current enrollment
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: params.userId },
            include: { cohorts: true },
        });
        if (!user) {
            return server_1.NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        // Delete old enrollment
        await prisma_1.prisma.userCohort.deleteMany({
            where: {
                userId: params.userId,
                cohortId: currentCohortId,
                courseId: courseId,
            },
        });
        // Create new enrollment
        const newEnrollment = await prisma_1.prisma.userCohort.create({
            data: {
                userId: params.userId,
                cohortId: newCohortId,
                courseId: courseId,
                isActive: true,
                previousEnrollmentId: currentCohortId,
            },
            include: { cohort: true },
        });
        // Create notification
        const newCohort = await prisma_1.prisma.cohort.findUnique({
            where: { id: newCohortId },
        });
        await prisma_1.prisma.notification.create({
            data: {
                userId: params.userId,
                type: "COHORT_SWITCHED",
                title: "Cohort Updated",
                message: `Your cohort has been switched to ${newCohort?.name}`,
                details: JSON.stringify({
                    oldCohortId: currentCohortId,
                    newCohortId: newCohortId,
                    courseId: courseId,
                    reason: reason,
                }),
            },
        });
        // Send email notification
        if (user.email) {
            await (0, email_1.sendEmail)({
                to: user.email,
                subject: "Your Cohort Has Been Updated",
                html: `
          <h2>Cohort Update</h2>
          <p>Hi ${user.name},</p>
          <p>Your cohort has been switched to <strong>${newCohort?.name}</strong>.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
          <p>Please log in to your account to see the details.</p>
        `,
            });
        }
        return server_1.NextResponse.json(newEnrollment, { status: 200 });
    }
    catch (error) {
        console.error("Error switching cohort:", error);
        return server_1.NextResponse.json({ error: "Failed to switch cohort" }, { status: 500 });
    }
}
//# sourceMappingURL=switch-cohort.js.map