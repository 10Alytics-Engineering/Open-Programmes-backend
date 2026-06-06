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

    const [quiz, answer, quizAnswered] = await Promise.all([
      // Check if user already answered this quiz
      prismadb.quiz.findUnique({
        where: { id: quizId },
        include: {
          courseModule: {
            select: {
              CourseWeek: {
                select: {
                  courseId: true,
                },
              },
            },
          },
        },
      }),

      // Get the answer to check if it's correct
      prismadb.quizAnswer.findUnique({
        where: { id: answerId },
      }),

      prismadb.userQuizAnswer.findUnique({
        where: {
          userId_quizAnswerId: {
            userId,
            quizAnswerId: answerId,
          },
        },
      }),
    ]);

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    if (!answer) {
      return res.status(404).json({ message: "Answer not found" });
    }

    if (quizAnswered) {
      return res.status(403).json({ message: "Quiz already answered by user" });
    }

    const userCohort = await prismadb.userCohort.findFirst({
      where: {
        isActive: true,
        userId: user?.id,
        courseId: quiz.courseModule.CourseWeek.courseId,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!userCohort?.id) {
      return res.status(404).json({
        status: "error",
        message: "Active cohort for user not found",
      });
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
      await prismadb.courseCohortLeaderboard.upsert({
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
  } catch (error) {}
};
