import { Request, Response } from "express";
import { prismadb } from "../../index";
import { NebiantUser } from "../../middleware";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const getQuizzes = async (req: Request, res: Response) => {
  try {
    const quizzes = await prismadb.quiz.findMany({
      include: {
        answers: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    res.status(200).json({ status: "success", message: null, data: quizzes });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getQuiz = async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;

    if (!quizId) {
      return res.status(400).json({ message: "QuizId is required" });
    }

    const quiz = await prismadb.quiz.findUnique({
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
  } catch (error) {
    handleServerError(error, res);
  }
};

export const createQuiz = async (req: Request, res: Response) => {
  const {
    question,
    answers,
    moduleId,
  }: {
    question: string;
    moduleId: string;
    answers: { name: string; isCorrect: boolean }[];
  } = req.body;

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
    const quiz = await prismadb.quiz.create({
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
  } catch (error) {
    handleServerError(error, res);
  }
};

export const deleteQuiz = async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;

    if (!quizId) {
      return res.status(400).json({ message: "QuizId is required" });
    }

    const quiz = await prismadb.quiz.findUnique({
      where: {
        id: quizId,
      },
    });

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    await prismadb.quiz.delete({
      where: {
        id: quizId,
      },
    });

    res.status(200).json({
      status: "Quiz deleted successfully",
      message: null,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};
export const getQuizzesByWeek = async (req: Request, res: Response) => {
  try {
    const { weekId } = req.params;

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    // Get all modules for this week
    const modules = await prismadb.module.findMany({
      where: { courseWeekId: weekId },
    });

    // If no modules exist, return empty array
    if (!modules.length) {
      return res.status(200).json({ data: [] });
    }

    // Get quizzes for these modules
    const quizzes = await prismadb.quiz.findMany({
      where: { moduleId: { in: modules.map((m) => m.id) } },
      include: { answers: true },
      orderBy: { createdAt: "asc" },
    });

    res.status(200).json({ data: quizzes });
  } catch (error) {
    handleServerError(error, res);
  }
};

// Add this new controller
export const updateQuiz = async (req: Request, res: Response) => {
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
    const updatedQuiz = await prismadb.quiz.update({
      where: { id: quizId },
      data: { question },
      include: { answers: true },
    });

    // Then update or create answers
    for (const answer of answers) {
      if (answer.id) {
        // Update existing answer
        await prismadb.quizAnswer.update({
          where: { id: answer.id },
          data: {
            name: answer.name,
            isCorrect: answer.isCorrect,
          },
        });
      } else {
        // Create new answer
        await prismadb.quizAnswer.create({
          data: {
            name: answer.name,
            isCorrect: answer.isCorrect,
            quizId: quizId,
          },
        });
      }
    }

    // Fetch the updated quiz with answers
    const finalQuiz = await prismadb.quiz.findUnique({
      where: { id: quizId },
      include: { answers: true },
    });

    res.status(200).json({
      status: "success",
      message: "Quiz updated successfully",
      data: finalQuiz,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const submitQuizAnswer = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;
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
    const existingAnswer = await prismadb.userQuizAnswer.findFirst({
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
    const answer = await prismadb.quizAnswer.findUnique({
      where: { id: answerId },
      include: { quiz: true },
    });

    if (!answer) {
      return res.status(404).json({ message: "Answer not found" });
    }

    // Record the user's answer
    await prismadb.userQuizAnswer.create({
      data: {
        userId,
        quizAnswerId: answerId,
      },
    });

    // If answer is correct, update leaderboard
    if (answer.isCorrect) {
      // Check if user already has a leaderboard entry for this quiz
      const existingLeaderboard = await prismadb.leaderboard.findFirst({
        where: {
          userId,
          quizId,
        },
      });

      if (existingLeaderboard) {
        // Update existing points
        await prismadb.leaderboard.update({
          where: { id: existingLeaderboard.id },
          data: { points: existingLeaderboard.points + 1 },
        });
      } else {
        // Create new leaderboard entry
        await prismadb.leaderboard.create({
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
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getUserQuizAnswers = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;
    const userId = user.id;

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const userAnswers = await prismadb.userQuizAnswer.findMany({
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
  } catch (error) {
    handleServerError(error, res);
  }
};
