import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { User } from "@prisma/client";
import { NebiantUser } from "../../middleware";
import { getCourseAccess } from "../../utils/course-access";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({
    message: "Internal Server Error",
    UPDATE_USER_COURSE_STATUS: error,
  });
};

export const getCourseLessonAccess = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;
    const { courseId } = req.params;

    if (!user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

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

    const course = await prismadb.course.findUnique({
      where: { id: courseId },
      include: {
        course_weeks: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            attachments: true,
            courseModules: {
              orderBy: {
                createdAt: "asc",
              },
              include: {
                projectVideos: true,
                quizzes: {
                  include: {
                    answers: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const isFreeAccess = access.accessType === "FREE";

    const formattedCourse = {
      ...course,
      accessType: access.accessType,
      canAccessFullCourse: access.accessType === "PAID",

      course_weeks: course.course_weeks.map((week: any) => ({
        ...week,

        attachments: isFreeAccess ? [] : week.attachments,

        courseModules: week.courseModules.map((module: any) => {
          const moduleHasFreeVideo = module.projectVideos.some(
            (video: any) => video.isFree,
          );

          const moduleLocked =
            isFreeAccess && !module.isFree && !moduleHasFreeVideo;

          return {
            ...module,
            isLocked: moduleLocked,
            canAccess: !moduleLocked,

            quizzes: isFreeAccess ? [] : module.quizzes,

            projectVideos: module.projectVideos.map((video: any) => {
              const canAccessVideo =
                access.accessType === "PAID" || module.isFree || video.isFree;

              return {
                ...video,
                isLocked: !canAccessVideo,
              };
            }),
          };
        }),
      })),
    };

    return res.status(200).json({
      status: "success",
      data: formattedCourse,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const addToOngoing = async (req: Request, res: Response) => {
  try {
    const user = req.user as User;
    const userId = user?.id;

    const { courseId }: { courseId: string } = req.body;

    const existingUser = await prismadb.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User does not exist" });
    }

    await prismadb.user.update({
      data: {
        ongoing_courses: {
          push: courseId,
        },
      },
      where: {
        id: userId,
      },
    });

    return res
      .status(200)
      .json({ status: "Ongoing courses updated", message: null });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const addToCompleted = async (req: Request, res: Response) => {
  try {
    const user = req.user as User;
    const userId = user?.id;

    const { courseId }: { courseId: string } = req.body;

    const existingUser = await prismadb.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User does not exist" });
    }

    const updatedOngoingCourses = existingUser.ongoing_courses.filter(
      (id) => id !== courseId,
    );

    await prismadb.user.update({
      data: {
        ongoing_courses: updatedOngoingCourses,
        completed_courses: {
          push: courseId,
        },
      },
      where: {
        id: userId,
      },
    });

    return res
      .status(200)
      .json({ status: "Completed courses updated", message: null });
  } catch (error) {
    handleServerError(error, res);
  }
};
