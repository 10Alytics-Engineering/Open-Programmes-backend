"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserCourseProgress = exports.getCourseProgress = exports.submitQuizAnswer = exports.updateCourseVideoProgress = void 0;
const prismadb_1 = require("../../lib/prismadb");
const handleError = (error, res) => {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error" });
};
const updateCourseVideoProgress = async (req, res) => {
    try {
        const user = req.user;
        const { courseId } = req.params;
        const { videoId, progressPercentage, lastPositionSeconds } = req.body;
        if (!user?.id)
            return res.status(401).json({ message: "Unauthorized" });
        if (!courseId || !videoId) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        const existingProgress = await prismadb_1.prismadb.userProgress.findUnique({
            where: {
                userId_videoId_courseId: {
                    userId: user.id,
                    videoId,
                    courseId,
                },
            },
        });
        const shouldBeCompleted = existingProgress?.isCompleted || progressPercentage >= 70;
        const finalProgressPercentage = shouldBeCompleted
            ? Math.max(existingProgress?.progressPercentage || 0, progressPercentage)
            : progressPercentage;
        // Using your existing schema without progressPercentage
        const progressRecord = await prismadb_1.prismadb.userProgress.upsert({
            where: {
                userId_videoId_courseId: {
                    userId: user.id,
                    videoId,
                    courseId,
                },
            },
            create: {
                userId: user.id,
                courseId,
                videoId,
                progressPercentage,
                lastPositionSeconds,
                lastWatched: new Date(),
                isCompleted: progressPercentage >= 70, // Mark as completed when progress is updated
            },
            update: {
                progressPercentage: finalProgressPercentage,
                lastPositionSeconds,
                lastWatched: new Date(),
                isCompleted: shouldBeCompleted,
            },
        });
        res.status(200).json(progressRecord);
    }
    catch (error) {
        handleError(error, res);
    }
};
exports.updateCourseVideoProgress = updateCourseVideoProgress;
const submitQuizAnswer = async (req, res) => {
    try {
        const user = req.user;
        const { quizAnswerId } = req.body;
        if (!user?.id)
            return res.status(401).json({ message: "Unauthorized" });
        if (!quizAnswerId) {
            return res.status(400).json({ message: "Missing answer ID" });
        }
        // Get answer with quiz info using your schema relations
        const answer = await prismadb_1.prismadb.quizAnswer.findUnique({
            where: { id: quizAnswerId },
            include: {
                quiz: {
                    include: {
                        courseModule: true,
                    },
                },
            },
        });
        if (!answer)
            return res.status(404).json({ message: "Answer not found" });
        // Check for existing answer
        const existingAnswer = await prismadb_1.prismadb.userQuizAnswer.findFirst({
            where: {
                userId: user.id,
                quizAnswerId,
            },
        });
        if (existingAnswer) {
            return res.status(400).json({ message: "Already answered this quiz" });
        }
        // Record answer
        const userAnswer = await prismadb_1.prismadb.userQuizAnswer.create({
            data: {
                userId: user.id,
                quizAnswerId,
            },
        });
        // Update leaderboard if correct
        if (answer.isCorrect) {
            await prismadb_1.prismadb.leaderboard.upsert({
                where: {
                    userId_quizId: {
                        userId: user.id,
                        quizId: answer.quiz.id,
                    },
                },
                create: {
                    userId: user.id,
                    quizId: answer.quiz.id,
                    points: 1,
                },
                update: {
                    points: { increment: 1 },
                },
            });
        }
        res.status(200).json({
            isCorrect: answer.isCorrect,
            userAnswer,
        });
    }
    catch (error) {
        handleError(error, res);
    }
};
exports.submitQuizAnswer = submitQuizAnswer;
const getCourseProgress = async (req, res) => {
    try {
        const user = req.user;
        const { courseId } = req.params;
        if (!user?.id)
            return res.status(401).json({ message: "Unauthorized" });
        if (!courseId)
            return res.status(400).json({ message: "Course ID required" });
        // Get all videos in course
        const videos = await prismadb_1.prismadb.projectVideo.findMany({
            where: { courseId },
            select: { id: true },
        });
        // Get all quizzes in course - fixed query to match your schema
        const quizzes = await prismadb_1.prismadb.quiz.findMany({
            where: {
                moduleId: {
                    // Using moduleId directly
                    in: await prismadb_1.prismadb.module
                        .findMany({
                        where: {
                            CourseWeek: {
                                courseId,
                            },
                        },
                        select: { id: true },
                    })
                        .then((modules) => modules.map((m) => m.id)),
                },
            },
            select: { id: true },
        });
        // Get completed videos
        const completedVideos = await prismadb_1.prismadb.userProgress.findMany({
            where: {
                userId: user.id,
                courseId,
                videoId: { in: videos.map((v) => v.id) },
                isCompleted: true,
            },
        });
        // Get completed quizzes
        const quizAnswers = await prismadb_1.prismadb.userQuizAnswer.findMany({
            where: {
                userId: user.id,
                quizAnswer: {
                    quizId: { in: quizzes.map((q) => q.id) },
                },
            },
            distinct: ["quizAnswerId"],
        });
        const videoCompletion = completedVideos.length;
        const quizCompletion = quizAnswers.length;
        const totalVideos = videos.length;
        const totalQuizzes = quizzes.length;
        res.status(200).json({
            videoProgress: {
                completed: videoCompletion,
                total: totalVideos,
                percentage: totalVideos > 0
                    ? Math.round((videoCompletion / totalVideos) * 100)
                    : 0,
            },
            quizProgress: {
                completed: quizCompletion,
                total: totalQuizzes,
                percentage: totalQuizzes > 0
                    ? Math.round((quizCompletion / totalQuizzes) * 100)
                    : 0,
            },
            overallProgress: totalVideos + totalQuizzes > 0
                ? Math.round(((videoCompletion + quizCompletion) /
                    (totalVideos + totalQuizzes)) *
                    100)
                : 0,
        });
    }
    catch (error) {
        handleError(error, res);
    }
};
exports.getCourseProgress = getCourseProgress;
const getUserCourseProgress = async (req, res) => {
    try {
        const user = req.user;
        const { courseId } = req.params;
        if (!user?.id)
            return res.status(401).json({ message: "Unauthorized" });
        if (!courseId)
            return res.status(400).json({ message: "Course ID required" });
        // Get all videos in course
        const completedVideos = await prismadb_1.prismadb.userProgress.count({
            where: {
                userId: user.id,
                courseId,
                isCompleted: true,
            },
        });
        const course = await prismadb_1.prismadb.course.findUnique({
            where: { id: courseId },
            include: {
                course_weeks: {
                    include: {
                        courseModules: {
                            include: {
                                projectVideos: true,
                            },
                        },
                    },
                },
            },
        });
        const totalVideos = course?.course_weeks.reduce((weekTotal, week) => {
            return (weekTotal +
                week.courseModules.reduce((moduleTotal, module) => {
                    return moduleTotal + module.projectVideos.length;
                }, 0));
        }, 0) || 0;
        const progressPercentage = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;
        return res.json({
            courseId,
            totalVideos,
            completedVideos,
            progressPercentage,
        });
    }
    catch (error) {
        handleError(error, res);
    }
};
exports.getUserCourseProgress = getUserCourseProgress;
//# sourceMappingURL=index.js.map