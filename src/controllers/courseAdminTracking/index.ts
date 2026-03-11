import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { User } from "@prisma/client";
// Helper function to get student engagement data
async function getStudentEngagementData(userId: string, courseId?: string) {
  const enrolledCourses = await prismadb.purchase.findMany({
    where: { userId },
    include: {
      course: {
        include: {
          course_weeks: {
            include: {
              courseModules: {
                include: {
                  projectVideos: true,
                  quizzes: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const completedVideos = await prismadb.userProgress.findMany({
    where: {
      userId,
      isCompleted: true,
      ...(courseId ? { courseId } : {}),
    },
  });

  const videoDetails = await prismadb.projectVideo.findMany({
    where: {
      id: { in: completedVideos.map((v) => v.videoId) },
    },
    include: {
      courseModule: {
        include: {
          CourseWeek: true,
        },
      },
    },
  });

  const quizAnswers = await prismadb.userQuizAnswer.findMany({
    where: { userId },
    include: {
      quizAnswer: {
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
      },
    },
  });

  // Filter by course if specified
  const filteredCourses = courseId
    ? enrolledCourses.filter((course) => course.courseId === courseId)
    : enrolledCourses;

  const engagementData = filteredCourses.map((course) => {
    const totalVideos = course.course.course_weeks.reduce((acc, week) => {
      return (
        acc +
        week.courseModules.reduce((moduleAcc, module) => {
          return moduleAcc + module.projectVideos.length;
        }, 0)
      );
    }, 0);

    const totalQuizzes = course.course.course_weeks.reduce((acc, week) => {
      return (
        acc +
        week.courseModules.reduce((moduleAcc, module) => {
          return moduleAcc + module.quizzes.length;
        }, 0)
      );
    }, 0);

    const videosCompleted = videoDetails.filter(
      (v) =>
        v.courseModule?.CourseWeek?.courseId === course.courseId &&
        completedVideos.some((cv) => cv.videoId === v.id)
    ).length;

    const quizzesCompleted = quizAnswers.filter(
      (q) =>
        q.quizAnswer.quiz.courseModule?.CourseWeek?.courseId === course.courseId
    ).length;

    // FIXED: Get last activity without relying on video relation
    const lastActivity = [...completedVideos, ...quizAnswers].filter(
      (item) =>
        ("videoId" in item
          ? videoDetails.find((v) => v.id === item.videoId)?.courseModule
              ?.CourseWeek?.courseId
          : item.quizAnswer.quiz.courseModule?.CourseWeek?.courseId) ===
        course.courseId
    );
    return {
      courseId: course.courseId,
      courseTitle: course.course.title,
      totalVideos,
      totalQuizzes,
      videosCompleted,
      quizzesCompleted,
      videoCompletionRate:
        totalVideos > 0 ? (videosCompleted / totalVideos) * 100 : 0,
      quizCompletionRate:
        totalQuizzes > 0 ? (quizzesCompleted / totalQuizzes) * 100 : 0,
    };
  });

  return engagementData;
}

// Get all students for a course (course admin view)
export const getCourseAdminStudents = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;

    // Get all students enrolled in this course
    const students = await prismadb.purchase.findMany({
      where: { courseId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            cohorts: {
              include: {
                cohort: true,
              },
            },
            createdAt: true,
          },
        },
        course: {
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
        },
      },
      orderBy: {
        user: {
          name: "asc",
        },
      },
    });

    if (!students.length) {
      return res
        .status(404)
        .json({ message: "No students found for this course" });
    }

    // Get all completed videos for these users in this course
    const userIds = students.map((s) => s.user.id);
    const completedVideos = await prismadb.userProgress.findMany({
      where: {
        userId: { in: userIds },
        courseId,
        isCompleted: true,
      },
    });

    // Format the response with progress data
    const response = students.map((purchase) => {
      const user = purchase.user;

      // Calculate total videos for this course
      const totalVideos = purchase.course.course_weeks.reduce((acc, week) => {
        return (
          acc +
          week.courseModules.reduce(
            (moduleAcc, module) => moduleAcc + module.projectVideos.length,
            0
          )
        );
      }, 0);

      // Count completed videos for this user in this course
      const videosCompleted = completedVideos.filter(
        (v) => v.userId === user.id
      ).length;

      return {
        ...user,
        enrolledAt: purchase.createdAt,
        totalVideos,
        videosCompleted:
          videosCompleted === 0 ? videosCompleted : videosCompleted - 2,
        expectedVideoProgress: calculateExpectedProgress(purchase.createdAt),
      };
    });

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching course admin students:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Helper function to calculate expected progress based on enrollment date
function calculateExpectedProgress(enrolledAt: Date): number {
  const now = new Date();
  const daysEnrolled = Math.floor(
    (now.getTime() - enrolledAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Example: Expect 10% progress per week, capped at 100%
  const expectedProgress = Math.min(Math.floor(daysEnrolled / 7) * 10, 100);
  return expectedProgress;
}

// Get engagement data for a specific student in a course
export const getCourseAdminStudentEngagement = async (
  req: Request,
  res: Response
) => {
  try {
    const { courseId, studentId } = req.params;

    // Verify the student is enrolled in this course
    const enrollment = await prismadb.purchase.findFirst({
      where: {
        courseId,
        userId: studentId,
      },
    });

    if (!enrollment) {
      return res
        .status(404)
        .json({ message: "Student not enrolled in this course" });
    }

    // Get engagement data for this student in this course
    const engagementData = await getStudentEngagementData(studentId, courseId);

    if (!engagementData.length) {
      return res.status(404).json({
        message:
          "No engagement data found for this student in the specified course",
      });
    }

    res.status(200).json(engagementData[0]); // Return single course engagement
  } catch (error) {
    console.error("Error fetching course admin student engagement:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all courses managed by this course admin with student counts
export const getCourseAdminDashboard = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = req.user as User;

    // For admins, show all courses
    if (user.role === "ADMIN") {
      const courses = await prismadb.course.findMany({
        include: {
          _count: {
            select: {
              purchases: true,
            },
          },
        },
      });

      return res.status(200).json(
        courses.map((course) => ({
          id: course.id,
          title: course.title,
          studentCount: course._count.purchases,
          imageUrl: course.imageUrl,
        }))
      );
    }

    // For course admins, we need to determine which courses they manage
    // Since we're not modifying schema, we'll assume course admins manage all courses
    // In a real implementation, you'd want to add a CourseAdmin model
    const courses = await prismadb.course.findMany({
      include: {
        _count: {
          select: {
            purchases: true,
          },
        },
      },
    });

    res.status(200).json(
      courses.map((course) => ({
        id: course.id,
        title: course.title,
        studentCount: course._count.purchases,
        imageUrl: course.imageUrl,
      }))
    );
  } catch (error) {
    console.error("Error fetching course admin dashboard:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
