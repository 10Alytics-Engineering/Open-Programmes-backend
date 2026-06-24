"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToCompleted = exports.addToOngoing = exports.getCourseLessonAccess = void 0;
const prismadb_1 = require("../../lib/prismadb");
const course_access_1 = require("../../utils/course-access");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({
        message: "Internal Server Error",
        UPDATE_USER_COURSE_STATUS: error,
    });
};
const getCourseLessonAccess = async (req, res) => {
    try {
        const user = req.user;
        const { courseId } = req.params;
        if (!user?.id) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const access = await (0, course_access_1.getCourseAccess)({
            userId: user.id,
            email: user.email,
            courseId,
        });
        if (access.accessType === "NONE") {
            return res.status(403).json({
                message: "You do not have access to this course",
            });
        }
        const course = await prismadb_1.prismadb.course.findUnique({
            where: { id: courseId },
            include: {
                course_weeks: {
                    include: {
                        attachments: true,
                        courseModules: {
                            include: {
                                projectVideos: true,
                                quizzes: {
                                    include: {
                                        answers: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }
        const formattedCourse = {
            ...course,
            accessType: access.accessType,
            canAccessFullCourse: access.accessType === "PAID",
            course_weeks: course.course_weeks.map((week) => ({
                ...week,
                courseModules: week.courseModules.map((module) => {
                    const isLocked = access.accessType === "FREE" && !module.isFree;
                    return {
                        ...module,
                        isLocked,
                        canAccess: !isLocked,
                        projectVideos: module.projectVideos.map((video) => ({
                            ...video,
                            isLocked,
                        })),
                        quizzes: module.quizzes.map((quiz) => ({
                            ...quiz,
                            isLocked,
                        })),
                    };
                }),
            })),
        };
        return res.status(200).json({
            status: "success",
            data: formattedCourse,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourseLessonAccess = getCourseLessonAccess;
const addToOngoing = async (req, res) => {
    try {
        const user = req.user;
        const userId = user?.id;
        const { courseId } = req.body;
        const existingUser = await prismadb_1.prismadb.user.findUnique({
            where: {
                id: userId,
            },
        });
        if (!existingUser) {
            return res.status(404).json({ message: "User does not exist" });
        }
        await prismadb_1.prismadb.user.update({
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
        const existingUser = await prismadb_1.prismadb.user.findUnique({
            where: {
                id: userId,
            },
        });
        if (!existingUser) {
            return res.status(404).json({ message: "User does not exist" });
        }
        const updatedOngoingCourses = existingUser.ongoing_courses.filter((id) => id !== courseId);
        await prismadb_1.prismadb.user.update({
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