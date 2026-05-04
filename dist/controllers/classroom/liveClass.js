"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLiveClassDetails = exports.getLiveClassesForUser = exports.recordAttendance = void 0;
const prismadb_1 = require("../../lib/prismadb");
const recordAttendance = async (req, res) => {
    try {
        const { liveClassId, userId: providedUserId, email: providedEmail } = req.body;
        if (!liveClassId || (!providedUserId && !providedEmail)) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        let userId = providedUserId;
        // If userId not provided, lookup by email
        if (!userId && providedEmail) {
            const user = await prismadb_1.prismadb.user.findUnique({
                where: { email: providedEmail }
            });
            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }
            userId = user.id;
        }
        // Check if attendance already recorded
        const existing = await prismadb_1.prismadb.liveClassAttendance.findUnique({
            where: {
                liveClassId_userId: {
                    liveClassId,
                    userId,
                },
            },
        });
        if (existing) {
            return res.status(200).json({ message: "Attendance already recorded" });
        }
        await prismadb_1.prismadb.liveClassAttendance.create({
            data: {
                liveClassId,
                userId,
            },
        });
        res.status(201).json({ message: "Attendance recorded" });
    }
    catch (error) {
        console.error("Record attendance error:", error);
        res.status(500).json({ error: "Failed to record attendance" });
    }
};
exports.recordAttendance = recordAttendance;
const getLiveClassesForUser = async (req, res) => {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: "Unauthorized" });
        const now = new Date();
        // Get all cohorts the user is in
        const userCohorts = await prismadb_1.prismadb.userCohort.findMany({
            where: { userId: user.id, isActive: true },
        });
        const cohortIds = userCohorts.map(uc => uc.cohortId);
        // Find active live classes for these cohorts
        const activeLiveClasses = await prismadb_1.prismadb.liveClass.findMany({
            where: {
                cohortCourse: {
                    cohortId: { in: cohortIds },
                },
                startTime: { lte: now },
                endTime: { gte: now },
            },
            include: {
                cohortCourse: {
                    include: {
                        cohort: true,
                        course: true,
                    }
                }
            },
            orderBy: { startTime: 'asc' },
        });
        res.json({ activeLiveClasses });
    }
    catch (error) {
        console.error("Get active live classes error:", error);
        res.status(500).json({ error: "Failed to fetch active live classes" });
    }
};
exports.getLiveClassesForUser = getLiveClassesForUser;
const getLiveClassDetails = async (req, res) => {
    try {
        const { liveClassId } = req.params;
        const liveClass = await prismadb_1.prismadb.liveClass.findUnique({
            where: { id: liveClassId },
            include: {
                cohortCourse: {
                    include: {
                        cohort: true,
                    }
                },
                _count: {
                    select: { attendance: true }
                }
            }
        });
        if (!liveClass) {
            return res.status(404).json({ error: "Live class not found" });
        }
        res.json({ liveClass });
    }
    catch (error) {
        console.error("Get live class details error:", error);
        res.status(500).json({ error: "Failed to fetch live class details" });
    }
};
exports.getLiveClassDetails = getLiveClassDetails;
//# sourceMappingURL=liveClass.js.map