"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToCompleted = exports.addToOngoing = void 0;
const index_1 = require("../../../src/index");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({
        message: "Internal Server Error",
        UPDATE_USER_COURSE_STATUS: error,
    });
};
const addToOngoing = async (req, res) => {
    try {
        const user = req.user;
        const userId = user?.id;
        const { courseId } = req.body;
        const existingUser = await index_1.prismadb.user.findUnique({
            where: {
                id: userId,
            },
        });
        if (!existingUser) {
            return res.status(404).json({ message: "User does not exist" });
        }
        await index_1.prismadb.user.update({
            data: {
                ongoing_courses: {
                    push: courseId,
                },
            },
            where: {
                id: userId,
            },
        });
        return res
            .status(200)
            .json({ status: "Ongoing courses updated", message: null });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.addToOngoing = addToOngoing;
const addToCompleted = async (req, res) => {
    try {
        const user = req.user;
        const userId = user?.id;
        const { courseId } = req.body;
        const existingUser = await index_1.prismadb.user.findUnique({
            where: {
                id: userId,
            },
        });
        if (!existingUser) {
            return res.status(404).json({ message: "User does not exist" });
        }
        const updatedOngoingCourses = existingUser.ongoing_courses.filter((id) => id !== courseId);
        await index_1.prismadb.user.update({
            data: {
                ongoing_courses: updatedOngoingCourses,
                completed_courses: {
                    push: courseId,
                },
            },
            where: {
                id: userId,
            },
        });
        return res
            .status(200)
            .json({ status: "Completed courses updated", message: null });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.addToCompleted = addToCompleted;
//# sourceMappingURL=index.js.map