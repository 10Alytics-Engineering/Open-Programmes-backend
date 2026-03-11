import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { incrementPoints } from "../../helpers/increment-points";
import { NebiantUser } from "../../middleware";

export const submitAnswer = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;
    const userId = user?.id;

    const {
      quizId,
      answerId,
    }: { userId: string; quizId: string; answerId: string } = req.body;

    const quiz = await prismadb.quiz.findUnique({
      where: { id: quizId },
    });

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const answer = await prismadb.quizAnswer.findUnique({
      where: { id: answerId },
    });

    if (!answer) {
      return res.status(404).json({ message: "Answer not found" });
    }

    const quizAnswered = await prismadb.userQuizAnswer.findUnique({
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

    await prismadb.userQuizAnswer.create({
      data: {
        userId,
        quizAnswerId: answer?.id,
      },
    });

    const isCorrect = answer.isCorrect;

    // Increment points if the answer is correct
    if (isCorrect) {
      await incrementPoints(userId, quizId, isCorrect);
    }

    return res
      .status(200)
      .json({ message: "Quiz Answer submitted successfully", isCorrect });
  } catch (error) {
    return res.status(500).json({ SUBMIT_QUIZ_ANSWER: error });
  }
};

export const deleteQuizAnswer = async (req: Request, res: Response) => {
  try {
    const { quizId, quizAnswerId } = req.params;

    if (!quizId) {
      return res.status(400).json({ message: "QuizId is required" });
    }

    if (!quizAnswerId) {
      return res.status(400).json({ message: "QuizAnswerId is required" });
    }

    const quiz = await prismadb.quiz.findUnique({
      where: {
        id: quizId,
      },
    });

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const quizAnswer = await prismadb.quizAnswer.findUnique({
      where: {
        id: quizAnswerId,
      },
    });

    if (!quizAnswer) {
      return res.status(404).json({ message: "Quiz answer not found" });
    }

    await prismadb.quizAnswer.delete({
      where: {
        id: quizAnswerId,
      },
    });

    return res
      .status(200)
      .json({ message: "Quiz answer deleted successfully" });
  } catch (error) { }
};
