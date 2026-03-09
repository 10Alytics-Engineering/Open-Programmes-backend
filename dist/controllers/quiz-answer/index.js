"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteQuizAnswer = exports.submitAnswer = void 0;
const index_1 = require("../../index");
const increment_points_1 = require("../../helpers/increment-points");
const submitAnswer = async (req, res) => {
    try {
        const user = req.user;
        const userId = user?.id;
        const { quizId, answerId, } = req.body;
        const quiz = await index_1.prismadb.quiz.findUnique({
            where: { id: quizId },
        });
        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }
        const answer = await index_1.prismadb.quizAnswer.findUnique({
            where: { id: answerId },
        });
        if (!answer) {
            return res.status(404).json({ message: "Answer not found" });
        }
        const quizAnswered = await index_1.prismadb.userQuizAnswer.findUnique({
            where: {
                userId_quizAnswerId: {
                    userId,
                    quizAnswerId: answerId,
                },
            },
        });
        if (quizAnswered) {
            return res.status(403).json({ message: "Quiz already answered by user" });
        }
        await index_1.prismadb.userQuizAnswer.create({
            data: {
                userId,
                quizAnswerId: answer?.id,
            },
        });
        const isCorrect = answer.isCorrect;
        // Increment points if the answer is correct
        if (isCorrect) {
            await (0, increment_points_1.incrementPoints)(userId, quizId, isCorrect);
        }
        return res
            .status(200)
            .json({ message: "Quiz Answer submitted successfully", isCorrect });
    }
    catch (error) {
        return res.status(500).json({ SUBMIT_QUIZ_ANSWER: error });
    }
};
exports.submitAnswer = submitAnswer;
const deleteQuizAnswer = async (req, res) => {
    try {
        const { quizId, quizAnswerId } = req.params;
        if (!quizId) {
            return res.status(400).json({ message: "QuizId is required" });
        }
        if (!quizAnswerId) {
            return res.status(400).json({ message: "QuizAnswerId is required" });
        }
        const quiz = await index_1.prismadb.quiz.findUnique({
            where: {
                id: quizId,
            },
        });
        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }
        const quizAnswer = await index_1.prismadb.quizAnswer.findUnique({
            where: {
                id: quizAnswerId,
            },
        });
        if (!quizAnswer) {
            return res.status(404).json({ message: "Quiz answer not found" });
        }
        await index_1.prismadb.quizAnswer.delete({
            where: {
                id: quizAnswerId,
            },
        });
        return res
            .status(200)
            .json({ message: "Quiz answer deleted successfully" });
    }
    catch (error) { }
};
exports.deleteQuizAnswer = deleteQuizAnswer;
//# sourceMappingURL=index.js.map