"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCourseProgress = exports.submitQuizAnswer = exports.updateCourseVideoProgress = void 0;
const index_1 = require("../../index");
const handleError = (error, res) => {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error" });
};
const updateCourseVideoProgress = async (req, res) => {
    try {
        const user = req.user;
        const { courseId } = req.params;
        const { videoId } = req.body;
        if (!user?.id)
            return res.status(401).json({ message: "Unauthorized" });
        if (!courseId || !videoId) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        // Using your existing schema without progressPercentage
        const progressRecord = await index_1.prismadb.userProgress.upsert({
            where: {
                userId_videoId_courseId: {
                    userId: user.id,
                    videoId,
                    courseId
                }
            },
            create: {
                userId: user.id,
                courseId,
                videoId,
                isCompleted: true // Mark as completed when progress is updated
            },
            update: {
                isCompleted: true
            }
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
        const answer = await index_1.prismadb.quizAnswer.findUnique({
            where: { id: quizAnswerId },
            include: {
                quiz: {
                    include: {
                        courseModule: true
                    }
                }
            }
        });
        if (!answer)
            return res.status(404).json({ message: "Answer not found" });
        // Check for existing answer
        const existingAnswer = await index_1.prismadb.userQuizAnswer.findFirst({
            where: {
                userId: user.id,
                quizAnswerId
            }
        });
        if (existingAnswer) {
            return res.status(400).json({ message: "Already answered this quiz" });
        }
        // Record answer
        const userAnswer = await index_1.prismadb.userQuizAnswer.create({
            data: {
                userId: user.id,
                quizAnswerId
            }
        });
        // Update leaderboard if correct
        if (answer.isCorrect) {
            await index_1.prismadb.leaderboard.upsert({
                where: {
                    userId_quizId: {
                        userId: user.id,
                        quizId: answer.quiz.id
                    }
                },
                create: {
                    userId: user.id,
                    quizId: answer.quiz.id,
                    points: 1
                },
                update: {
                    points: { increment: 1 }
                }
            });
        }
        res.status(200).json({
            isCorrect: answer.isCorrect,
            userAnswer
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
        const videos = await index_1.prismadb.projectVideo.findMany({
            where: { courseId },
            select: { id: true }
        });
        // Get all quizzes in course - fixed query to match your schema
        const quizzes = await index_1.prismadb.quiz.findMany({
            where: {
                moduleId: {
                    in: await index_1.prismadb.module.findMany({
                        where: {
                            CourseWeek: {
                                courseId
                            }
                        },
                        select: { id: true }
                    }).then(modules => modules.map(m => m.id))
                }
            },
            select: { id: true }
        });
        // Get completed videos
        const completedVideos = await index_1.prismadb.userProgress.findMany({
            where: {
                userId: user.id,
                courseId,
                videoId: { in: videos.map(v => v.id) },
                isCompleted: true
            }
        });
        // Get completed quizzes
        const quizAnswers = await index_1.prismadb.userQuizAnswer.findMany({
            where: {
                userId: user.id,
                quizAnswer: {
                    quizId: { in: quizzes.map(q => q.id) }
                }
            },
            distinct: ['quizAnswerId']
        });
        const videoCompletion = completedVideos.length;
        const quizCompletion = quizAnswers.length;
        const totalVideos = videos.length;
        const totalQuizzes = quizzes.length;
        res.status(200).json({
            videoProgress: {
                completed: videoCompletion,
                total: totalVideos,
                percentage: totalVideos > 0 ? Math.round((videoCompletion / totalVideos) * 100) : 0
            },
            quizProgress: {
                completed: quizCompletion,
                total: totalQuizzes,
                percentage: totalQuizzes > 0 ? Math.round((quizCompletion / totalQuizzes) * 100) : 0
            },
            overallProgress: totalVideos + totalQuizzes > 0
                ? Math.round(((videoCompletion + quizCompletion) / (totalVideos + totalQuizzes)) * 100)
                : 0
        });
    }
    catch (error) {
        handleError(error, res);
    }
};
exports.getCourseProgress = getCourseProgress;
//# sourceMappingURL=index.js.map