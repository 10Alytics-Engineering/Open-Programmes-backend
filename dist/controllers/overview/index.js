"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudentDashboardCourseContext = exports.getStudentDashboard = exports.getOverview = void 0;
const prismadb_1 = require("../../lib/prismadb");
const dashboard_service_1 = require("../../services/dashboard.service");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getOverview = async (req, res) => {
    try {
        const user = req.user;
        let courses = [];
        let users = [];
        let cohorts = [];
        let blogs = [];
        const queries = [];
        if (["SUPER_ADMIN", "COURSE_ADMIN"].includes(user.role)) {
            queries.push(prismadb_1.prismadb.course.findMany().then((data) => {
                courses = data;
            }));
            queries.push(prismadb_1.prismadb.cohort.findMany().then((data) => {
                cohorts = data;
            }));
        }
        if (["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
            queries.push(prismadb_1.prismadb.user.findMany().then((data) => {
                users = data;
            }));
            queries.push(prismadb_1.prismadb.blog.findMany().then((data) => {
                blogs = data;
            }));
        }
        await Promise.all(queries);
        const modelOverview = [
            ...(users.length
                ? [{ title: "Users", category: users, route: "/users" }]
                : []),
            ...(courses.length
                ? [{ title: "Courses", category: courses, route: "/courses" }]
                : []),
            ...(cohorts.length
                ? [{ title: "Cohorts", category: cohorts, route: "/cohort" }]
                : []),
            ...(blogs.length
                ? [{ title: "Blogs", category: blogs, route: "/blogs" }]
                : []),
        ];
        res
            .status(200)
            .json({ status: "success", message: null, data: modelOverview });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getOverview = getOverview;
const getStudentDashboard = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await prismadb_1.prismadb.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                image: true,
                course_purchased: {
                    include: {
                        course: {
                            select: {
                                id: true,
                                title: true,
                                imageUrl: true,
                                imageKey: true,
                            },
                        },
                    },
                },
                cohorts: {
                    where: { isActive: true },
                    include: {
                        cohort: {
                            select: {
                                id: true,
                                name: true,
                                courseId: true,
                            },
                        },
                    },
                },
            },
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const selectedCourseId = user.course_purchased[0]?.courseId;
        const selectedCohortId = user.cohorts.find((item) => item.courseId === selectedCourseId)?.cohortId;
        const [watchedVideos, quizAnswers, notifications] = await Promise.all([
            prismadb_1.prismadb.userProgress.count({
                where: {
                    userId,
                    isCompleted: true,
                },
            }),
            prismadb_1.prismadb.userQuizAnswer.findMany({
                where: { userId },
                select: {
                    quizAnswer: {
                        select: {
                            quizId: true,
                        },
                    },
                },
            }),
            prismadb_1.prismadb.notification.findMany({
                where: {
                    userId,
                    isRead: false,
                },
                orderBy: {
                    createdAt: "desc",
                },
                take: 10,
            }),
        ]);
        const uniqueTakenQuizIds = new Set(quizAnswers.map((item) => item.quizAnswer.quizId));
        const courses = user.course_purchased.map((purchase) => ({
            id: purchase.course.id,
            title: purchase.course.title,
            imageUrl: purchase.course.imageUrl,
            imageKey: purchase.course.imageKey,
            cohorts: user.cohorts
                .filter((item) => item.courseId === purchase.courseId)
                .map((item) => ({
                id: item.cohort.id,
                name: item.cohort.name,
                isActive: item.isActive,
            })),
        }));
        return res.status(200).json({
            status: "success",
            data: {
                selectedCourseId,
                selectedCohortId,
                stats: {
                    enrolledCourses: user.course_purchased.length,
                    watchedVideos,
                    takenQuizzes: uniqueTakenQuizIds.size,
                },
                courses,
                notifications,
            },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getStudentDashboard = getStudentDashboard;
const getStudentDashboardCourseContext = async (req, res) => {
    try {
        const userId = req.user.id;
        const { courseId, cohortId } = req.query;
        if (!courseId || !cohortId) {
            return res.status(400).json({
                message: "courseId and cohortId are required",
            });
        }
        const [leaderboard, learningPath] = await Promise.all([
            prismadb_1.prismadb.courseCohortLeaderboard.findMany({
                where: {
                    courseId: courseId,
                    cohortId: cohortId,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            image: true,
                        },
                    },
                },
                orderBy: {
                    points: "desc",
                },
                take: 10,
            }),
            (0, dashboard_service_1.getLearningPathProgress)({
                userId,
                courseId: courseId,
                cohortId: cohortId,
            }),
        ]);
        return res.status(200).json({
            status: "success",
            data: {
                leaderboard: leaderboard.map((item, index) => ({
                    rank: index + 1,
                    userId: item.userId,
                    name: item.user.name,
                    image: item.user.image,
                    points: item.points,
                    assignmentPoints: item.assignmentPoints,
                    lessonQuizPoints: item.lessonQuizPoints,
                    lessonVideoPoints: item.lessonVideoPoints,
                })),
                learningPath,
            },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getStudentDashboardCourseContext = getStudentDashboardCourseContext;
//# sourceMappingURL=index.js.map