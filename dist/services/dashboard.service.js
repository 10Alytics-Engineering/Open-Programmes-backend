"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLearningPathProgress = exports.getUserQuizProgressByModule = void 0;
const prismadb_1 = require("../lib/prismadb");
const getUserQuizProgressByModule = async ({ userId, quizIds, }) => {
    if (!quizIds.length)
        return {
            answeredQuizIds: new Set(),
            correctQuizIds: new Set(),
        };
    const userAnswers = await prismadb_1.prismadb.userQuizAnswer.findMany({
        where: {
            userId,
            quizAnswer: {
                quizId: {
                    in: quizIds,
                },
            },
        },
        select: {
            quizAnswer: {
                select: {
                    quizId: true,
                    isCorrect: true,
                },
            },
        },
    });
    const answeredQuizIds = new Set(userAnswers.map((item) => item.quizAnswer.quizId));
    const correctQuizIds = new Set(userAnswers
        .filter((item) => item.quizAnswer.isCorrect)
        .map((item) => item.quizAnswer.quizId));
    return {
        answeredQuizIds,
        correctQuizIds,
    };
};
exports.getUserQuizProgressByModule = getUserQuizProgressByModule;
const getLearningPathProgress = async ({ userId, courseId, cohortId, }) => {
    const cohortCourse = await prismadb_1.prismadb.cohortCourse.findFirst({
        where: {
            courseId,
            cohortId,
        },
        include: {
            cohortWeeks: {
                orderBy: {
                    createdAt: "asc",
                },
                include: {
                    cohortModules: {
                        orderBy: {
                            createdAt: "asc",
                        },
                        include: {
                            cohortProjectVideos: true,
                            cohortQuizzes: true,
                        },
                    },
                },
            },
        },
    });
    if (!cohortCourse)
        return [];
    const videoIds = cohortCourse.cohortWeeks.flatMap((week) => week.cohortModules.flatMap((module) => module.cohortProjectVideos.map((video) => video.id)));
    const quizIds = cohortCourse.cohortWeeks.flatMap((week) => week.cohortModules.flatMap((module) => module.cohortQuizzes.map((quiz) => quiz.id)));
    const [completedVideos, quizProgress] = await Promise.all([
        prismadb_1.prismadb.userProgress.findMany({
            where: {
                userId,
                courseId,
                videoId: {
                    in: videoIds,
                },
                isCompleted: true,
            },
            select: {
                videoId: true,
            },
        }),
        (0, exports.getUserQuizProgressByModule)({
            userId,
            quizIds,
        }),
    ]);
    const completedVideoIds = new Set(completedVideos.map((item) => item.videoId));
    const answeredQuizIds = quizProgress.answeredQuizIds || new Set();
    const correctQuizIds = quizProgress.correctQuizIds || new Set();
    return cohortCourse.cohortWeeks.map((week) => {
        const modules = week.cohortModules.map((module) => {
            const totalVideos = module.cohortProjectVideos.length;
            const completedVideos = module.cohortProjectVideos.filter((video) => completedVideoIds.has(video.id)).length;
            const totalQuizzes = module.cohortQuizzes.length;
            const completedQuizzes = module.cohortQuizzes.filter((quiz) => answeredQuizIds.has(quiz.id)).length;
            const correctQuizzes = module.cohortQuizzes.filter((quiz) => correctQuizIds.has(quiz.id)).length;
            const totalItems = totalVideos + totalQuizzes;
            const completedItems = completedVideos + completedQuizzes;
            return {
                moduleId: module.id,
                moduleTitle: module.title,
                totalVideos,
                completedVideos,
                totalQuizzes,
                completedQuizzes,
                correctQuizzes,
                progressPercentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
            };
        });
        const weekTotalItems = modules.reduce((sum, module) => sum + module.totalVideos + module.totalQuizzes, 0);
        const weekCompletedItems = modules.reduce((sum, module) => sum + module.completedVideos + module.completedQuizzes, 0);
        return {
            weekId: week.id,
            weekTitle: week.title,
            modules,
            progressPercentage: weekTotalItems > 0
                ? Math.round((weekCompletedItems / weekTotalItems) * 100)
                : 0,
        };
    });
};
exports.getLearningPathProgress = getLearningPathProgress;
//# sourceMappingURL=dashboard.service.js.map