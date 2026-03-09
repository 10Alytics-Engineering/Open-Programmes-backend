"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserCohort = void 0;
const index_1 = require("../../index");
const updateUserCohort = async (req, res) => {
    try {
        const { cohortId } = req.params;
        const { userId, courseId, newCohortId, } = req.body;
        if (!newCohortId) {
            return res.status(400).json({ message: "New CohortId is required" });
        }
        if (!cohortId) {
            return res.status(400).json({ message: "CohortId is required" });
        }
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!userId) {
            return res.status(400).json({ message: "UserId is required" });
        }
        const user = await index_1.prismadb.user.findUnique({
            where: {
                id: userId,
            },
        });
        if (!user) {
            return res.status(404).json({ message: "User does not exist" });
        }
        const existingCohort = await index_1.prismadb.cohort.findUnique({
            where: {
                id: cohortId,
            },
        });
        if (!existingCohort) {
            return res.status(404).json({ message: "Cohort not found" });
        }
        // Find the existing UserCohort record
        const userCohort = await index_1.prismadb.userCohort.findUnique({
            where: {
                userId_cohortId_courseId: {
                    userId,
                    cohortId,
                    courseId,
                },
            },
        });
        if (!userCohort) {
            return res.status(404).json({ message: "UserCohort not found" });
        }
        // Check if the new cohortId combination is unique
        const existingRecord = await index_1.prismadb.userCohort.findUnique({
            where: {
                userId_cohortId_courseId: {
                    userId,
                    cohortId: newCohortId,
                    courseId,
                },
            },
        });
        if (existingRecord) {
            return res.status(400).json({
                message: "User is already enrolled in the specified cohort for the course",
            });
        }
        // Update the UserCohort record
        await index_1.prismadb.userCohort.update({
            data: {
                cohortId: newCohortId,
            },
            where: {
                id: userCohort.id,
            },
        });
        res.status(200).json({ status: "User's Cohort updated", message: null });
    }
    catch (error) {
        return res.status(500).json({ UPDATE_USER_COHORT: error });
    }
};
exports.updateUserCohort = updateUserCohort;
//# sourceMappingURL=index.js.map