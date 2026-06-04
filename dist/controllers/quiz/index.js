"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserQuizAnswers = exports.submitQuizAnswer = exports.updateQuiz = exports.getQuizzesByWeek = exports.deleteQuiz = exports.createQuiz = exports.getQuiz = exports.getQuizzes = void 0;
const prismadb_1 = require("../../lib/prismadb");
const notification_service_1 = require("../../services/notification.service");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getQuizzes = async (req, res) => {
    try {
        const quizzes = await prismadb_1.prismadb.quiz.findMany({
            include: {
                answers: true,
            },
            orderBy: {
                createdAt: "asc",
            },
        });
        res.status(200).json({ status: "success", message: null, data: quizzes });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getQuizzes = getQuizzes;
const getQuiz = async (req, res) => {
    try {
        const { quizId } = req.params;
        if (!quizId) {
            return res.status(400).json({ message: "QuizId is required" });
        }
        const quiz = await prismadb_1.prismadb.quiz.findUnique({
            where: {
                id: quizId,
            },
            include: {
                answers: true,
            },
        });
        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }
        res.status(200).json({
            status: "success",
            message: null,
            data: quiz,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getQuiz = getQuiz;
const createQuiz = async (req, res) => {
    const { question, answers, moduleId, } = req.body;
    if (!moduleId) {
        return res.status(400).json({ message: "ModuleId is required" });
    }
    if (!question) {
        return res.status(400).json({ message: "Question is required" });
    }
    if (!answers || !answers.length) {
        return res.status(400).json({ message: "Answer is required" });
    }
    const [users, module] = await Promise.all([
        prismadb_1.prismadb.user.findMany({
            where: {
                inactive: false,
                course_purchased: {
                    some: {
                        course: {
                            course_weeks: {
                                some: {
                                    courseModules: {
                                        some: { id: moduleId },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            select: {
                id: true,
            },
        }),
        prismadb_1.prismadb.module.findUnique({
            where: {
                id: moduleId,
            },
            select: {
                id: true,
                title: true,
                CourseWeek: {
                    select: {
                        id: true,
                        title: true,
                        course: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
                    },
                },
            },
        }),
    ]);
    if (!module) {
        return res.status(404).json({ message: "Module not found" });
    }
    const adminUser = req.user;
    try {
        const [quiz, notifications] = await Promise.all([
            prismadb_1.prismadb.quiz.create({
                data: {
                    question,
                    moduleId,
                    answers: {
                        create: answers.map((answer) => ({
                            name: answer.name,
                            isCorrect: answer.isCorrect,
                        })),
                    },
                },
                include: {
                    answers: true,
                },
            }),
            notification_service_1.NotificationService.createMany(users.map((item) => item.id), "COURSE_QUIZ_ADDED", {
                courseId: module.CourseWeek.course?.id,
                courseTitle: module.CourseWeek.course?.title,
                weekId: module.CourseWeek.id,
                weekName: module.CourseWeek.title,
                moduleId: module.id,
                moduleTitle: module.title,
                actionUrl: `/dashboard/lessons/${module.CourseWeek.course.id}?weekId=${module.CourseWeek.id}&moduleId=${module.id}`,
            }, adminUser?.id),
        ]);
        res.status(201).json({
            status: "success",
            message: "Quiz created successfully",
            data: quiz,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.createQuiz = createQuiz;
const deleteQuiz = async (req, res) => {
    try {
        const { quizId } = req.params;
        if (!quizId) {
            return res.status(400).json({ message: "QuizId is required" });
        }
        const quiz = await prismadb_1.prismadb.quiz.findUnique({
            where: {
                id: quizId,
            },
        });
        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }
        await prismadb_1.prismadb.quiz.delete({
            where: {
                id: quizId,
            },
        });
        res.status(200).json({
            status: "Quiz deleted successfully",
            message: null,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteQuiz = deleteQuiz;
const getQuizzesByWeek = async (req, res) => {
    try {
        const { weekId } = req.params;
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        // Get all modules for this week
        const modules = await prismadb_1.prismadb.module.findMany({
            where: { courseWeekId: weekId },
        });
        // If no modules exist, return empty array
        if (!modules.length) {
            return res.status(200).json({ data: [] });
        }
        // Get quizzes for these modules
        const quizzes = await prismadb_1.prismadb.quiz.findMany({
            where: { moduleId: { in: modules.map((m) => m.id) } },
            include: { answers: true },
            orderBy: { createdAt: "asc" },
        });
        res.status(200).json({ data: quizzes });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getQuizzesByWeek = getQuizzesByWeek;
const updateQuiz = async (req, res) => {
    try {
        const { quizId } = req.params;
        const { question, answers } = req.body;
        if (!quizId) {
            return res.status(400).json({ message: "QuizId is required" });
        }
        if (!question) {
            return res.status(400).json({ message: "Question is required" });
        }
        // First update the quiz question
        const updatedQuiz = await prismadb_1.prismadb.quiz.update({
            where: { id: quizId },
            data: { question },
            include: { answers: true },
        });
        // Then update or create answers
        for (const answer of answers) {
            if (answer.id) {
                // Update existing answer
                await prismadb_1.prismadb.quizAnswer.update({
                    where: { id: answer.id },
                    data: {
                        name: answer.name,
                        isCorrect: answer.isCorrect,
                    },
                });
            }
            else {
                // Create new answer
                await prismadb_1.prismadb.quizAnswer.create({
                    data: {
                        name: answer.name,
                        isCorrect: answer.isCorrect,
                        quizId: quizId,
                    },
                });
            }
        }
        // Fetch the updated quiz with answers
        const finalQuiz = await prismadb_1.prismadb.quiz.findUnique({
            where: { id: quizId },
            include: {
                answers: true,
                courseModule: {
                    select: {
                        id: true,
                        title: true,
                        CourseWeek: {
                            select: {
                                id: true,
                                title: true,
                                courseId: true,
                                course: {
                                    select: {
                                        id: true,
                                        title: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (finalQuiz?.courseModule?.CourseWeek?.course?.id) {
            const courseId = finalQuiz.courseModule.CourseWeek.course.id;
            const enrolledUsers = await prismadb_1.prismadb.purchase.findMany({
                where: {
                    courseId,
                    user: {
                        inactive: false,
                    },
                },
                select: {
                    userId: true,
                },
            });
            const userIds = enrolledUsers.map((item) => item.userId);
            if (userIds.length > 0) {
                await notification_service_1.NotificationService.createMany(userIds, "COURSE_QUIZ_EDITED", {
                    courseId,
                    courseTitle: finalQuiz.courseModule.CourseWeek.course.title,
                    moduleId: finalQuiz.courseModule.id,
                    moduleTitle: finalQuiz.courseModule.title,
                    weekId: finalQuiz.courseModule.CourseWeek.id,
                    weekName: finalQuiz.courseModule.CourseWeek.title,
                    quizId: finalQuiz.id,
                    quizTitle: finalQuiz.question,
                    actionUrl: `/dashboard/lessons/${courseId}?weekId=${finalQuiz.courseModule.CourseWeek.id}&moduleId=${finalQuiz.courseModule.id}`,
                });
            }
        }
        res.status(200).json({
            status: "success",
            message: "Quiz updated successfully",
            data: finalQuiz,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateQuiz = updateQuiz;
const submitQuizAnswer = async (req, res) => {
    try {
        const user = req.user;
        const userId = user.id;
        const { quizId, answerId } = req.body;
        if (!userId) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        if (!quizId || !answerId) {
            return res
                .status(400)
                .json({ message: "QuizId and AnswerId are required" });
        }
        const [existingAnswer, answer] = await Promise.all([
            // Check if user already answered this quiz
            prismadb_1.prismadb.userQuizAnswer.findFirst({
                where: {
                    userId,
                    quizAnswer: {
                        quizId,
                    },
                },
            }),
            // Get the answer to check if it's correct
            prismadb_1.prismadb.quizAnswer.findUnique({
                where: { id: answerId },
                include: {
                    quiz: {
                        select: {
                            courseModule: {
                                select: { CourseWeek: { select: { courseId: true } } },
                            },
                        },
                    },
                },
            }),
        ]);
        if (existingAnswer) {
            return res
                .status(400)
                .json({ message: "You've already answered this quiz" });
        }
        if (!answer) {
            return res.status(404).json({ message: "Answer not found" });
        }
        const userCohort = await prismadb_1.prismadb.userCohort.findFirst({
            where: {
                isActive: true,
                userId: user?.id,
                courseId: answer.quiz.courseModule.CourseWeek.courseId,
            },
            orderBy: { createdAt: "desc" },
        });
        if (!userCohort?.id) {
            return res.status(404).json({
                status: "error",
                message: "Active cohort for user not found",
            });
        }
        // Record the user's answer
        await prismadb_1.prismadb.userQuizAnswer.create({
            data: {
                userId,
                quizAnswerId: answerId,
            },
        });
        // If answer is correct, update leaderboard
        if (answer.isCorrect) {
            // Check if user already has a leaderboard entry for this quiz
            await prismadb_1.prismadb.courseCohortLeaderboard.upsert({
                where: {
                    userId_courseId_cohortId: {
                        cohortId: userCohort?.cohortId,
                        courseId: userCohort?.courseId,
                        userId: user.id,
                    },
                },
                create: {
                    assignmentPoints: 0,
                    points: 1,
                    lessonQuizPoints: 1,
                    lessonVideoPoints: 0,
                    cohortId: userCohort?.cohortId,
                    courseId: userCohort?.courseId,
                    userId: user.id,
                },
                update: {
                    lessonQuizPoints: { increment: 1 },
                    points: { increment: 1 },
                },
            });
        }
        res.status(200).json({
            status: "success",
            message: "Quiz answer submitted successfully",
            data: { isCorrect: answer.isCorrect },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.submitQuizAnswer = submitQuizAnswer;
const getUserQuizAnswers = async (req, res) => {
    try {
        const user = req.user;
        const userId = user.id;
        if (!userId) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        const userAnswers = await prismadb_1.prismadb.userQuizAnswer.findMany({
            where: { userId },
            include: {
                quizAnswer: {
                    include: {
                        quiz: true,
                    },
                },
            },
        });
        res.status(200).json({
            status: "success",
            message: null,
            data: userAnswers,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getUserQuizAnswers = getUserQuizAnswers;
//# sourceMappingURL=index.js.map