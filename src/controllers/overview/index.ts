import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { NebiantUser } from "../../middleware";
import { getLearningPathProgress } from "../../services/dashboard.service";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const getOverview = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;

    let courses: any[] = [];
    let users: any[] = [];
    let cohorts: any[] = [];
    let blogs: any[] = [];

    const queries: Promise<any>[] = [];

    if (["SUPER_ADMIN", "COURSE_ADMIN"].includes(user.role)) {
      queries.push(
        prismadb.course.findMany().then((data) => {
          courses = data;
        }),
      );

      queries.push(
        prismadb.cohort.findMany().then((data) => {
          cohorts = data;
        }),
      );
    }

    if (["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
      queries.push(
        prismadb.user.findMany().then((data) => {
          users = data;
        }),
      );

      queries.push(
        prismadb.blog.findMany().then((data) => {
          blogs = data;
        }),
      );
    }

    await Promise.all(queries);

    const modelOverview = [
      ...(users.length
        ? [{ title: "Users", category: users, route: "/users" }]
        : []),

      ...(courses.length
        ? [{ title: "Courses", category: courses, route: "/courses" }]
        : []),

      ...(cohorts.length
        ? [{ title: "Cohorts", category: cohorts, route: "/cohort" }]
        : []),

      ...(blogs.length
        ? [{ title: "Blogs", category: blogs, route: "/blogs" }]
        : []),
    ];

    res
      .status(200)
      .json({ status: "success", message: null, data: modelOverview });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getStudentDashboard = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as NebiantUser).id;

    const user = await prismadb.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        image: true,
        course_purchased: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
                imageUrl: true,
                imageKey: true,
              },
            },
          },
        },
        cohorts: {
          where: { isActive: true },
          include: {
            cohort: {
              select: {
                id: true,
                name: true,
                courseId: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const selectedCourseId = user.course_purchased[0]?.courseId;

    const selectedCohortId = user.cohorts.find(
      (item) => item.courseId === selectedCourseId,
    )?.cohortId;

    const [watchedVideos, quizAnswers, notifications] = await Promise.all([
      prismadb.userProgress.count({
        where: {
          userId,
          isCompleted: true,
        },
      }),

      prismadb.userQuizAnswer.findMany({
        where: { userId },
        select: {
          quizAnswer: {
            select: {
              quizId: true,
            },
          },
        },
      }),

      prismadb.notification.findMany({
        where: {
          userId,
          isRead: false,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      }),
    ]);

    const uniqueTakenQuizIds = new Set(
      quizAnswers.map((item) => item.quizAnswer.quizId),
    );

    const courses = user.course_purchased.map((purchase) => ({
      id: purchase.course.id,
      title: purchase.course.title,
      imageUrl: purchase.course.imageUrl,
      imageKey: purchase.course.imageKey,
      cohorts: user.cohorts
        .filter((item) => item.courseId === purchase.courseId)
        .map((item) => ({
          id: item.cohort.id,
          name: item.cohort.name,
          isActive: item.isActive,
        })),
    }));

    return res.status(200).json({
      status: "success",
      data: {
        selectedCourseId,
        selectedCohortId,

        stats: {
          enrolledCourses: user.course_purchased.length,
          watchedVideos,
          takenQuizzes: uniqueTakenQuizIds.size,
        },

        courses,
        notifications,
      },
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getStudentDashboardCourseContext = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = (req.user as NebiantUser).id;
    const { courseId, cohortId } = req.query;

    if (!courseId || !cohortId) {
      return res.status(400).json({
        message: "courseId and cohortId are required",
      });
    }

    const [leaderboard, learningPath] = await Promise.all([
      prismadb.courseCohortLeaderboard.findMany({
        where: {
          courseId: courseId as string,
          cohortId: cohortId as string,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        orderBy: {
          points: "desc",
        },
        take: 10,
      }),

      getLearningPathProgress({
        userId,
        courseId: courseId as string,
        cohortId: cohortId as string,
      }),
    ]);

    return res.status(200).json({
      status: "success",
      data: {
        leaderboard: leaderboard.map((item, index) => ({
          rank: index + 1,
          userId: item.userId,
          name: item.user.name,
          image: item.user.image,
          points: item.points,
          assignmentPoints: item.assignmentPoints,
          lessonQuizPoints: item.lessonQuizPoints,
          lessonVideoPoints: item.lessonVideoPoints,
        })),

        learningPath,
      },
    });
  } catch (error) {
    handleServerError(error, res);
  }
};
