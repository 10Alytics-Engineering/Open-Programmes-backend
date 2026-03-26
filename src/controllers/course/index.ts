import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { NebiantUser } from "../../middleware/index";
import { Purchase } from "@prisma/client";

const handleServerError = (error: any, res: Response) => {
  console.error("❌ [SERVER_ERROR]:", error);
  res.status(500).json({ status: "error", message: error.message || "Internal Server Error", details: error });
};

export const getCourses = async (req: Request, res: Response) => {
  try {
    const courses = await prismadb.course.findMany({
      include: {
        skills_you_will_learn: true,
        learning_Outcomes: true,
        prerequisites: true,
        tags: true,
        catalog_header_tags: true,
        course_weeks: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            courseModules: {
              orderBy: {
                createdAt: "asc",
              },
              include: {
                projectVideos: {
                  select: {
                    id: true,
                    title: true,
                    thumbnailUrl: true,
                    duration: true,
                    moduleId: true,
                    courseId: true,
                    createdAt: true,
                    updatedAt: true,
                  },
                  orderBy: {
                    createdAt: "asc",
                  },
                },
                quizzes: {
                  orderBy: {
                    createdAt: "asc",
                  },
                  include: {
                    answers: true,
                  },
                },
              },
            },
          },
        },
        cohorts: true, // Modified from select: { id: true } to true
        timetable: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res
      .status(200)
      .json({ status: "success", message: null, data: courses });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getCourse = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;

    const user = req.user as NebiantUser;
    const userId = user?.id;
    const isAdmin = user?.role === "ADMIN" || user?.role === "COURSE_ADMIN";

    if (!userId) {
      throw new Error(
        "UserId not detected, cannot check if course has been purchased yet"
      );
    }

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    let coursePurchased: Purchase = null!;
    let isCoursePurchased: boolean = false;

    if (userId) {
      const currentUser = await prismadb.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          course_purchased: true,
        },
      });

      if (!currentUser) {
        return res.status(400).json({ message: "User does not exist" });
      }

      coursePurchased = currentUser.course_purchased.find(
        (course) => course?.courseId === courseId && course.userId === userId
      )!;

      isCoursePurchased = coursePurchased || isAdmin ? true : false;
    }

    const course = await prismadb.course.findUnique({
      where: {
        id: courseId,
      },
      include: {
        skills_you_will_learn: true,
        learning_Outcomes: true,
        prerequisites: true,
        tags: true,
        catalog_header_tags: true,
        course_weeks: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            attachments: isCoursePurchased ? true : false,
            courseModules: {
              orderBy: {
                createdAt: "asc",
              },
              include: {
                projectVideos: {
                  select: {
                    id: true,
                    title: true,
                    videoUrl: isCoursePurchased ? true : false,
                    thumbnailUrl: true,
                    duration: true,
                    moduleId: true,
                    courseId: true,
                    createdAt: true,
                    updatedAt: true,
                  },
                  orderBy: {
                    createdAt: "asc",
                  },
                },
                quizzes: {
                  orderBy: {
                    createdAt: "asc",
                  },
                  include: {
                    answers: true,
                  },
                },
              },
            },
          },
        },
        timetable: true,
        cohorts: true,
      },
    });

    if (!course) {
      return res.status(404).json({ message: "Course does not exist" });
    }

    return res.status(200).json({
      status: "success",
      message: `${user?.role === "USER" &&
        !coursePurchased &&
        "Course purchase not found, weekly attachments and video url is disabled"
        }`,
      data: course,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const createCourse = async (req: Request, res: Response) => {
  try {
    const { title }: { title: string } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const course = await prismadb.course.create({
      data: {
        title,
      },
      select: {
        id: true,
        title: true,
      },
    });

    return res
      .status(201)
      .json({ status: "Course created", message: null, data: course });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const updateCourse = async (req: Request, res: Response) => {
  try {
    const body = req.body;

    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    const existingCourse = await prismadb.course.findUnique({
      where: {
        id: courseId,
      },
    });

    if (!existingCourse) {
      return res.status(404).json({ message: "Course does not exist" });
    }

    const course = await prismadb.course.update({
      where: {
        id: courseId,
      },
      data: {
        ...body,
      },
    });

    return res
      .status(200)
      .json({ status: "Course updated", message: null, data: course });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const deleteCourse = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    const existingCourse = await prismadb.course.findUnique({
      where: {
        id: courseId,
      },
    });

    if (!existingCourse) {
      return res.status(404).json({ message: "Course does not exist" });
    }

    // 1. Fetch related IDs for deep cleanup
    const cohortCourses = await prismadb.cohortCourse.findMany({
      where: { courseId },
      select: { id: true }
    });
    const cohortCourseIds = cohortCourses.map(cc => cc.id);

    const courseWeeks = await prismadb.courseWeek.findMany({
      where: { courseId },
      select: { id: true }
    });
    const courseWeekIds = courseWeeks.map(cw => cw.id);

    // 2. Delete deep children (Leaf Nodes) first

    // Cleanup for CohortCourse descendants
    if (cohortCourseIds.length > 0) {
      // Delete Comments linked to announcements/submissions/posts in these cohort courses
      await prismadb.comment.deleteMany({
        where: {
          OR: [
            { announcement: { cohortCourseId: { in: cohortCourseIds } } },
            { submission: { assignment: { cohortCourseId: { in: cohortCourseIds } } } },
            { streamPost: { cohortCourseId: { in: cohortCourseIds } } }
          ]
        }
      });

      // Delete Assignment Submissions
      await prismadb.assignmentSubmission.deleteMany({
        where: { assignment: { cohortCourseId: { in: cohortCourseIds } } }
      });
      // Delete Assignment Quiz Submissions if the model exists in the Prisma client
      if ((prismadb as any).assignmentQuizSubmission) {
        await (prismadb as any).assignmentQuizSubmission.deleteMany({
          where: { assignment: { cohortCourseId: { in: cohortCourseIds } } }
        });
      }

      // Delete Assignments
      await prismadb.assignment.deleteMany({
        where: { cohortCourseId: { in: cohortCourseIds } }
      });

      // Delete Classroom Topics, Stream Posts, Announcements, Materials, Recordings
      await prismadb.classroomTopic.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
      await prismadb.streamPost.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
      await prismadb.announcement.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
      await prismadb.classMaterial.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
      await prismadb.classRecording.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
      await prismadb.cohortAttachment.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
      await prismadb.cohortQuiz.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
    }

    // Cleanup for CourseWeek descendants
    if (courseWeekIds.length > 0) {
      await prismadb.module.deleteMany({
        where: { courseWeekId: { in: courseWeekIds } }
      });
    }

    // Cleanup for PaymentStatus descendants
    await prismadb.paymentInstallment.deleteMany({
      where: { paymentStatus: { courseId: courseId } }
    });

    // 3. Delete intermediate models
    await prismadb.purchase.deleteMany({ where: { courseId } });
    await prismadb.cohortCourse.deleteMany({ where: { courseId } });
    await prismadb.cohort.deleteMany({ where: { courseId } });
    await prismadb.timeTable.deleteMany({ where: { courseId } });
    await prismadb.courseWeek.deleteMany({ where: { courseId } });

    // Cleanup ChangeRequests
    await prismadb.changeRequest.deleteMany({
      where: {
        OR: [
          { currentCourseId: courseId },
          { desiredCourseId: courseId }
        ]
      }
    });

    // 4. Delete Course-related simple models
    await prismadb.skillsYouWillLearn.deleteMany({ where: { courseId } });
    await prismadb.learningOutcome.deleteMany({ where: { courseId } });
    await prismadb.prerequisite.deleteMany({ where: { courseId } });
    await prismadb.tag.deleteMany({ where: { courseId } });
    await prismadb.catalogHeaderTags.deleteMany({ where: { courseId } });
    await prismadb.projectVideo.deleteMany({ where: { courseId } });
    await prismadb.userProgress.deleteMany({ where: { courseId } });
    await prismadb.paymentStatus.deleteMany({ where: { courseId } });
    await prismadb.paystackTransaction.deleteMany({ where: { courseId } });

    // 5. Final delete of the Course
    await prismadb.course.delete({
      where: {
        id: courseId,
      },
    });

    return res.status(200).json({ status: "Course deleted" });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getCourseWithoutAuth = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    const course = await prismadb.course.findUnique({
      where: {
        id: courseId,
      },
      include: {
        skills_you_will_learn: true,
        learning_Outcomes: true,
        prerequisites: true,
        tags: true,
        catalog_header_tags: true,
        course_weeks: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            courseModules: {
              orderBy: {
                createdAt: "asc",
              },
              include: {
                projectVideos: {
                  select: {
                    id: true,
                    title: true,
                    thumbnailUrl: true,
                    duration: true,
                    moduleId: true,
                    courseId: true,
                    createdAt: true,
                    updatedAt: true,
                  },
                  orderBy: {
                    createdAt: "asc",
                  },
                },
                quizzes: {
                  orderBy: {
                    createdAt: "asc",
                  },
                  include: {
                    answers: true,
                  },
                },
              },
            },
          },
        },
        timetable: true,
        cohorts: true,
      },
    });

    if (!course) {
      return res.status(404).json({ message: "Course does not exist" });
    }

    return res.status(200).json({
      status: "success",
      message: null,
      data: course,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getCourseWithoutAuthWithSlug = async (
  req: Request,
  res: Response
) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({ message: "Slug is required" });
    }

    const course = await prismadb.course.findFirst({
      where: {
        slug,
      },
      include: {
        skills_you_will_learn: true,
        learning_Outcomes: true,
        prerequisites: true,
        tags: true,
        catalog_header_tags: true,
        course_weeks: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            courseModules: {
              orderBy: {
                createdAt: "asc",
              },
              include: {
                projectVideos: {
                  select: {
                    id: true,
                    title: true,
                    thumbnailUrl: true,
                    duration: true,
                    moduleId: true,
                    courseId: true,
                    createdAt: true,
                    updatedAt: true,
                  },
                  orderBy: {
                    createdAt: "asc",
                  },
                },
                quizzes: {
                  orderBy: {
                    createdAt: "asc",
                  },
                  include: {
                    answers: true,
                  },
                },
              },
            },
          },
        },
        timetable: true,
        cohorts: true,
      },
    });

    if (!course) {
      return res.status(404).json({ message: "Course does not exist" });
    }

    return res.status(200).json({
      status: "success",
      message: null,
      data: course,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getCourseCohorts = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    // Verifying course exists
    const course = await prismadb.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Get cohorts for this course
    const cohorts = await prismadb.cohort.findMany({
      where: { courseId },
      orderBy: {
        startDate: "desc",
      },
      include: {
        users: {
          select: {
            id: true,
          },
        },
      },
    });

    return res.status(200).json({
      status: "success",
      message: null,
      data: cohorts,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};
