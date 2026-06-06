import { prismadb } from "../lib/prismadb";

type QuizProgressResult = {
  answeredQuizIds: Set<string>;
  correctQuizIds: Set<string>;
};

export const getUserQuizProgressByModule = async ({
  userId,
  quizIds,
}: {
  userId: string;
  quizIds: string[];
}): Promise<QuizProgressResult> => {
  if (!quizIds.length)
    return {
      answeredQuizIds: new Set<string>(),
      correctQuizIds: new Set<string>(),
    };

  const userAnswers = await prismadb.userQuizAnswer.findMany({
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

  const answeredQuizIds = new Set(
    userAnswers.map((item) => item.quizAnswer.quizId),
  );

  const correctQuizIds = new Set(
    userAnswers
      .filter((item) => item.quizAnswer.isCorrect)
      .map((item) => item.quizAnswer.quizId),
  );

  return {
    answeredQuizIds,
    correctQuizIds,
  };
};

export const getLearningPathProgress = async ({
  userId,
  courseId,
  cohortId,
}: {
  userId: string;
  courseId: string;
  cohortId: string;
}) => {
  const courseWeeks = await prismadb.courseWeek.findMany({
    where: {
      courseId,
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      courseModules: {
        orderBy: {
          createdAt: "asc",
        },
        include: {
          projectVideos: true,
          quizzes: true,
        },
      },
    },
  });

  if (!courseWeeks.length) {
    console.log("CohortCourse found but no cohortWeeks", courseWeeks);
    return [];
  }

  const videoIds = courseWeeks.flatMap((week) =>
    week.courseModules.flatMap((module) =>
      module.projectVideos.map((video) => video.id),
    ),
  );

  const quizIds = courseWeeks.flatMap((week) =>
    week.courseModules.flatMap((module) =>
      module.quizzes.map((quiz) => quiz.id),
    ),
  );

  const [completedVideos, quizProgress] = await Promise.all([
    prismadb.userProgress.findMany({
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

    getUserQuizProgressByModule({
      userId,
      quizIds,
    }),
  ]);

  const completedVideoIds = new Set(
    completedVideos.map((item) => item.videoId),
  );

  const answeredQuizIds = quizProgress.answeredQuizIds || new Set();
  const correctQuizIds = quizProgress.correctQuizIds || new Set();

  return courseWeeks.map((week) => {
    const modules = week.courseModules.map((module) => {
      const totalVideos = module.projectVideos.length;

      const completedVideos = module.projectVideos.filter((video) =>
        completedVideoIds.has(video.id),
      ).length;

      const totalQuizzes = module.quizzes.length;

      const completedQuizzes = module.quizzes.filter((quiz) =>
        answeredQuizIds.has(quiz.id),
      ).length;

      const correctQuizzes = module.quizzes.filter((quiz) =>
        correctQuizIds.has(quiz.id),
      ).length;

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
        progressPercentage:
          totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
      };
    });

    const weekTotalItems = modules.reduce(
      (sum, module) => sum + module.totalVideos + module.totalQuizzes,
      0,
    );

    const weekCompletedItems = modules.reduce(
      (sum, module) => sum + module.completedVideos + module.completedQuizzes,
      0,
    );

    return {
      weekId: week.id,
      weekTitle: week.title,
      modules,
      progressPercentage:
        weekTotalItems > 0
          ? Math.round((weekCompletedItems / weekTotalItems) * 100)
          : 0,
    };
  });
};
