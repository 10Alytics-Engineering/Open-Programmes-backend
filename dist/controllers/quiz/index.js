"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserQuizAnswers = exports.submitQuizAnswer = exports.updateQuiz = exports.getQuizzesByWeek = exports.deleteQuiz = exports.createQuiz = exports.getQuiz = exports.getQuizzes = void 0;
const index_1 = require("../../index");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getQuizzes = async (req, res) => {
    try {
        const quizzes = await index_1.prismadb.quiz.findMany({
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
        const quiz = await index_1.prismadb.quiz.findUnique({
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
    try {
        const quiz = await index_1.prismadb.quiz.create({
            data: {
                question,
                moduleId,
                answers: {
                    createMany: {
                        data: answers.map((answer) => ({
                            name: answer.name,
                            isCorrect: answer.isCorrect,
                        })),
                    },
                },
            },
            include: {
                answers: true,
            },
        });
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
        const quiz = await index_1.prismadb.quiz.findUnique({
            where: {
                id: quizId,
            },
        });
        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }
        await index_1.prismadb.quiz.delete({
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
        const modules = await index_1.prismadb.module.findMany({
            where: { courseWeekId: weekId },
        });
        // If no modules exist, return empty array
        if (!modules.length) {
            return res.status(200).json({ data: [] });
        }
        // Get quizzes for these modules
        const quizzes = await index_1.prismadb.quiz.findMany({
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
// Add this new controller
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
        const updatedQuiz = await index_1.prismadb.quiz.update({
            where: { id: quizId },
            data: { question },
            include: { answers: true },
        });
        // Then update or create answers
        for (const answer of answers) {
            if (answer.id) {
                // Update existing answer
                await index_1.prismadb.quizAnswer.update({
                    where: { id: answer.id },
                    data: {
                        name: answer.name,
                        isCorrect: answer.isCorrect,
                    },
                });
            }
            else {
                // Create new answer
                await index_1.prismadb.quizAnswer.create({
                    data: {
                        name: answer.name,
                        isCorrect: answer.isCorrect,
                        quizId: quizId,
                    },
                });
            }
        }
        // Fetch the updated quiz with answers
        const finalQuiz = await index_1.prismadb.quiz.findUnique({
            where: { id: quizId },
            include: { answers: true },
        });
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
        // Check if user already answered this quiz
        const existingAnswer = await index_1.prismadb.userQuizAnswer.findFirst({
            where: {
                userId,
                quizAnswer: {
                    quizId,
                },
            },
        });
        if (existingAnswer) {
            return res
                .status(400)
                .json({ message: "You've already answered this quiz" });
        }
        // Get the answer to check if it's correct
        const answer = await index_1.prismadb.quizAnswer.findUnique({
            where: { id: answerId },
            include: { quiz: true },
        });
        if (!answer) {
            return res.status(404).json({ message: "Answer not found" });
        }
        // Record the user's answer
        await index_1.prismadb.userQuizAnswer.create({
            data: {
                userId,
                quizAnswerId: answerId,
            },
        });
        // If answer is correct, update leaderboard
        if (answer.isCorrect) {
            // Check if user already has a leaderboard entry for this quiz
            const existingLeaderboard = await index_1.prismadb.leaderboard.findFirst({
                where: {
                    userId,
                    quizId,
                },
            });
            if (existingLeaderboard) {
                // Update existing points
                await index_1.prismadb.leaderboard.update({
                    where: { id: existingLeaderboard.id },
                    data: { points: existingLeaderboard.points + 1 },
                });
            }
            else {
                // Create new leaderboard entry
                await index_1.prismadb.leaderboard.create({
                    data: {
                        userId,
                        quizId,
                        points: 1,
                    },
                });
            }
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
        const userAnswers = await index_1.prismadb.userQuizAnswer.findMany({
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