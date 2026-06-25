import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { NebiantUser } from "../../middleware";
import { getCourseAccess } from "../../utils/course-access";

const handleError = (error: any, res: Response) => {
  console.error("Error:", error);
  res.status(500).json({ message: "Internal server error" });
};

export const updateCourseVideoProgress = async (
  req: Request,
  res: Response,
) => {
  try {
    const user = req.user as NebiantUser;
    const { courseId } = req.params;
    const { videoId, progressPercentage, lastPositionSeconds } = req.body;

    if (!user?.id) return res.status(401).json({ message: "Unauthorized" });
    if (!courseId || !videoId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [existingProgress, userCohort, video] = await Promise.all([
      prismadb.userProgress.findUnique({
        where: {
          userId_videoId_courseId: {
            userId: user.id,
            videoId,
            courseId,
          },
        },
      }),

      prismadb.userCohort.findFirst({
        where: {
          isActive: true,
          userId: user?.id,
        },
        orderBy: { createdAt: "desc" },
      }),

      prismadb.projectVideo.findFirst({
        where: {
          id: videoId,
          courseId,
        },
        include: {
          courseModule: true,
        },
      }),
    ]);

    const access = await getCourseAccess({
      userId: user.id,
      email: user.email,
      courseId,
    });

    if (access.accessType === "NONE") {
      return res.status(403).json({
        message: "You do not have access to this course",
      });
    } else if (access.accessType === "PAID") {
      if (!userCohort?.id) {
        return res.status(404).json({
          status: "error",
          message: "Active cohort for user not found",
        });
      }
    }

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    if (access.accessType === "FREE" && !video.courseModule.isFree) {
      return res.status(403).json({
        message: "This video requires full course access",
      });
    }

    const shouldBeCompleted =
      existingProgress?.isCompleted || progressPercentage >= 70;

    const finalProgressPercentage = shouldBeCompleted
      ? Math.max(existingProgress?.progressPercentage || 0, progressPercentage)
      : progressPercentage;

    // Using your existing schema without progressPercentage
    const progressRecord = await prismadb.userProgress.upsert({
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

    if (
      !existingProgress?.isCompleted &&
      progressPercentage >= 70 &&
      userCohort?.id
    ) {
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
          lessonQuizPoints: 0,
          lessonVideoPoints: 1,
          cohortId: userCohort?.cohortId,
          courseId: userCohort?.courseId,
          userId: user.id,
        },
        update: {
          lessonVideoPoints: { increment: 1 },
          points: { increment: 1 },
        },
      });
    }

    res.status(200).json(progressRecord);
  } catch (error) {
    handleError(error, res);
  }
};

export const submitQuizAnswer = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;
    const { quizAnswerId } = req.body;

    if (!user?.id) return res.status(401).json({ message: "Unauthorized" });
    if (!quizAnswerId) {
      return res.status(400).json({ message: "Missing answer ID" });
    }

    // Get answer with quiz info using your schema relations
    const [answer, existingAnswer, userCohort] = await Promise.all([
      prismadb.quizAnswer.findUnique({
        where: { id: quizAnswerId },
        include: {
          quiz: {
            include: {
              courseModule: {
                include: {
                  CourseWeek: true,
                },
              },
            },
          },
        },
      }),

      prismadb.userQuizAnswer.findFirst({
        where: {
          userId: user.id,
          quizAnswerId,
        },
      }),

      prismadb.userCohort.findFirst({
        where: {
          isActive: true,
          userId: user.id,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!answer) return res.status(404).json({ message: "Answer not found" });

    const courseId = answer.quiz.courseModule.CourseWeek.courseId;

    const access = await getCourseAccess({
      userId: user.id,
      email: user.email,
      courseId,
    });

    if (access.accessType === "NONE") {
      return res.status(403).json({
        message: "You do not have access to this course",
      });
    }

    if (access.accessType === "PAID") {
      if (!userCohort?.id) {
        return res.status(404).json({
          status: "error",
          message: "Active cohort for user not found",
        });
      }
    }

    if (access.accessType === "FREE" && !answer.quiz.courseModule.isFree) {
      return res.status(403).json({
        message: "This quiz requires full course access",
      });
    }

    if (existingAnswer) {
      return res.status(400).json({ message: "Already answered this quiz" });
    }

    // Record answer
    const userAnswer = await prismadb.userQuizAnswer.create({
      data: {
        userId: user.id,
        quizAnswerId,
      },
    });

    // Update leaderboard if correct
    if (answer.isCorrect && userCohort?.id) {
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

    res.status(200).json({
      isCorrect: answer.isCorrect,
      userAnswer,
    });
  } catch (error) {
    handleError(error, res);
  }
};

export const getCourseProgress = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;
    const { courseId } = req.params;

    if (!user?.id) return res.status(401).json({ message: "Unauthorized" });
    if (!courseId)
      return res.status(400).json({ message: "Course ID required" });

    // Get all videos in course
    const videos = await prismadb.projectVideo.findMany({
      where: { courseId },
      select: { id: true },
    });

    // Get all quizzes in course - fixed query to match your schema
    const quizzes = await prismadb.quiz.findMany({
      where: {
        moduleId: {
          // Using moduleId directly
          in: await prismadb.module
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
    const completedVideos = await prismadb.userProgress.findMany({
      where: {
        userId: user.id,
        courseId,
        videoId: { in: videos.map((v) => v.id) },
        isCompleted: true,
      },
    });

    // Get completed quizzes
    const quizAnswers = await prismadb.userQuizAnswer.findMany({
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
        percentage:
          totalVideos > 0
            ? Math.round((videoCompletion / totalVideos) * 100)
            : 0,
      },
      quizProgress: {
        completed: quizCompletion,
        total: totalQuizzes,
        percentage:
          totalQuizzes > 0
            ? Math.round((quizCompletion / totalQuizzes) * 100)
            : 0,
      },
      overallProgress:
        totalVideos + totalQuizzes > 0
          ? Math.round(
              ((videoCompletion + quizCompletion) /
                (totalVideos + totalQuizzes)) *
                100,
            )
          : 0,
    });
  } catch (error) {
    handleError(error, res);
  }
};

export const getUserCourseProgress = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;
    const { courseId } = req.params;

    if (!user?.id) return res.status(401).json({ message: "Unauthorized" });
    if (!courseId)
      return res.status(400).json({ message: "Course ID required" });

    // Get all videos in course
    const completedVideos = await prismadb.userProgress.count({
      where: {
        userId: user.id,
        courseId,
        isCompleted: true,
      },
    });

    const course = await prismadb.course.findUnique({
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

    const totalVideos =
      course?.course_weeks.reduce((weekTotal, week) => {
        return (
          weekTotal +
          week.courseModules.reduce((moduleTotal, module) => {
            return moduleTotal + module.projectVideos.length;
          }, 0)
        );
      }, 0) || 0;

    const progressPercentage =
      totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;

    return res.json({
      courseId,
      totalVideos,
      completedVideos,
      progressPercentage,
    });
  } catch (error) {
    handleError(error, res);
  }
};
