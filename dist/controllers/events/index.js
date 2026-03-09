"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentWeek = void 0;
const index_1 = require("../../index");
const getCurrentWeek = async (req, res) => {
    try {
        const { userId, courseId } = req.params;
        if (!userId) {
            return res.status(400).json({ message: "UserId is required" });
        }
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        // Get user's cohort for this course
        const userCohort = await index_1.prismadb.userCohort.findFirst({
            where: {
                userId,
                courseId,
            },
            include: {
                cohort: true,
            },
        });
        if (!userCohort || !userCohort.cohort) {
            return res.status(404).json({ message: "User is not in any cohort for this course" });
        }
        const cohortStartDate = userCohort.cohort.startDate;
        const now = new Date();
        // Calculate difference in weeks
        const diffInMs = now.getTime() - cohortStartDate.getTime();
        const diffInWeeks = Math.floor(diffInMs / (1000 * 60 * 60 * 24 * 7)) + 1; // +1 to count the current week
        // Get all weeks for this course
        const courseWeeks = await index_1.prismadb.courseWeek.findMany({
            where: {
                courseId,
            },
            orderBy: {
                createdAt: "asc",
            },
        });
        if (courseWeeks.length === 0) {
            return res.status(404).json({ message: "No weeks found for this course" });
        }
        // Determine current week (can't exceed total weeks)
        const currentWeekNumber = Math.min(diffInWeeks, courseWeeks.length);
        const currentWeek = courseWeeks[currentWeekNumber - 1]; // -1 because array is 0-indexed
        // Get upcoming events for this week
        const upcomingEvents = await index_1.prismadb.timeTable.findMany({
            where: {
                courseId,
                date: {
                    gte: new Date(), // Only future events
                },
            },
            orderBy: {
                date: "asc",
            },
            take: 1, // Get only the next upcoming event
        });
        return res.status(200).json({
            status: "success",
            data: {
                currentWeek,
                currentWeekNumber,
                totalWeeks: courseWeeks.length,
                upcomingEvent: upcomingEvents[0] || null,
            },
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.getCurrentWeek = getCurrentWeek;
//# sourceMappingURL=index.js.map