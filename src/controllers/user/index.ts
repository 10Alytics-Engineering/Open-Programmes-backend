import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { UserRole } from "@prisma/client";
import { sendAccountDeletionEmail } from "./mail";
import { sendMail } from "../../utils/nodemailer";
import bcrypt from "bcryptjs";
import { validateEmail } from "../../hooks/validate-email";
import { validatePassword } from "../../hooks/validate-password";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      role = "",
      course = "",
      cohort = "",
      cohortSearch = "",
      sortBy = "createdAt",
      sortOrder = "asc",
    } = req.query;

    const pageNumber = parseInt(page as string);
    const limitNumber = parseInt(limit as string);
    const skip = (pageNumber - 1) * limitNumber;

    // Build where clause for filtering
    const whereClause: any = {};

    // Search functionality
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    // Role filter
    if (role) {
      whereClause.role = role;
    }

    // Course filter
    if (course) {
      whereClause.course_purchased = {
        some: {
          courseId: course,
        },
      };
    }

    // Cohort filter
    if (cohort) {
      whereClause.cohorts = {
        some: {
          cohortId: cohort,
        },
      };
    } else if (cohortSearch) {
      whereClause.cohorts = {
        some: {
          isActive: true,
          ...(course && {
            courseId: course,
          }),
          cohort: {
            is: {
              name: {
                contains: cohortSearch,
                mode: "insensitive",
              },
            },
          },
        },
      };

      if (!course) {
        whereClause.course_purchased = {
          some: {},
        };
      }
    }

    // Build orderBy clause
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    // Get total count for pagination
    const totalUsers = await prismadb.user.count({
      where: whereClause,
    });

    // Fetch all courses and their project videos count once (very fast, selecting only IDs)
    const coursesSelect = await prismadb.course.findMany({
      select: {
        id: true,
        course_weeks: {
          select: {
            courseModules: {
              select: {
                projectVideos: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const courseVideosCountMap = new Map<string, number>();
    for (const c of coursesSelect) {
      const total = c.course_weeks.reduce((weekAcc, week) => {
        return (
          weekAcc +
          week.courseModules.reduce(
            (moduleAcc, module) => moduleAcc + module.projectVideos.length,
            0,
          )
        );
      }, 0);
      courseVideosCountMap.set(c.id, total);
    }

    // Get paginated users
    const users = await prismadb.user.findMany({
      where: whereClause,
      include: {
        course_purchased: {
          include: {
            course: true,
          },
        },
        cohorts: {
          include: {
            cohort: true,
          },
        },
        completed_videos: {
          select: {
            id: true,
            isCompleted: true,
            courseId: true,
            userId: true,
          },
        },
      },
      orderBy,
      skip,
      take: limitNumber,
    });

    // Enhance users with progress data
    const usersWithProgress = users.map((user) => {
      // Calculate total videos across all courses using our map
      const totalVideos = user.course_purchased.reduce((acc, purchase) => {
        return acc + (courseVideosCountMap.get(purchase.courseId) || 0);
      }, 0);

      // Count completed videos
      const videosCompleted = user.completed_videos?.length || 0;

      // Calculate expected progress based on account age
      const accountAgeDays = Math.floor(
        (new Date().getTime() - new Date(user.createdAt).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const expectedProgress = Math.min(
        Math.floor(accountAgeDays / 7) * 10,
        100,
      );

      return {
        ...user,
        totalVideos,
        videosCompleted,
        expectedVideoProgress: expectedProgress,
      };
    });

    const totalPages = Math.ceil(totalUsers / limitNumber);

    return res.status(200).json({
      status: "success",
      message: null,
      data: {
        users: usersWithProgress,
        pagination: {
          currentPage: pageNumber,
          totalPages,
          totalUsers,
          limit: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1,
        },
      },
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

//search endpoint for faster searches
export const searchUsers = async (req: Request, res: Response) => {
  try {
    const { query = "", limit = 10 } = req.query;

    if (!query || (query as string).length < 2) {
      return res.status(200).json({
        status: "success",
        data: [],
      });
    }

    const users = await prismadb.user.findMany({
      where: {
        OR: [
          { name: { contains: query as string, mode: "insensitive" } },
          { email: { contains: query as string, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      take: parseInt(limit as string),
      orderBy: {
        name: "asc",
      },
    });

    return res.status(200).json({
      status: "success",
      data: users,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        message: "UserId is required",
      });
    }

    const user = await prismadb.user.findUnique({
      where: {
        id: userId,
      },

      include: {
        completed_videos: true,

        course_purchased: {
          include: {
            course: {
              include: {
                facilitators: true,

                course_videos: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
                course_weeks: {
                  include: {
                    courseModules: {
                      include: {
                        quizzes: {
                          include: {
                            answers: {
                              select: {
                                id: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },

        cohorts: {
          select: {
            cohortId: true,
            userId: true,
            isPaymentActive: true,
            isActive: true,
            archivedAt: true,

            cohort: {
              select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                courseId: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },

        quiz_answers: {
          include: {
            quizAnswer: {
              include: {
                quiz: true,
              },
            },
          },
        },
        paymentStatus: {
          include: {
            course: true,
            paymentInstallments: true,
            transactions: {
              select: {
                courseId: true,
                amount: true,
                status: true,
                paymentDate: true,
              },
            },
          },
        },

        quiz_leaderboard: {
          select: {
            points: true,
            quizId: true,
            userId: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "Nonexistent User!",
      });
    }

    // ENRICH COURSE DATA
    const enrichedCourses = user.course_purchased.map((purchase: any) => {
      const course = purchase.course;
      // =========================
      // VIDEO STATS
      // =========================

      const totalVideos = course.course_videos?.length || 0;

      const completedVideoRecords =
        user.completed_videos?.filter(
          (video: any) => video?.courseId === course?.id && video.isCompleted,
        ) || [];
      const completedVideos = completedVideoRecords.length || 0;

      const videoProgressPercentage = completedVideos
        ? Math.round((completedVideos / totalVideos) * 100)
        : 0;

      // =========================
      // QUIZ STATS
      // =========================

      const allQuizzes = course.course_weeks?.flatMap((week: any) =>
        week.courseModules?.flatMap((module: any) => module.quizzes),
      );

      const totalQuizzes = allQuizzes?.length || 0;

      const answeredQuizIds = new Set(
        user.quiz_answers?.map((item: any) => item.quizAnswer.quizId),
      );

      const completedQuizzes =
        allQuizzes?.filter((quiz: any) => answeredQuizIds.has(quiz?.id))
          .length || 0;

      const quizProgressPercentage =
        totalQuizzes > 0
          ? Math.round((completedQuizzes / totalQuizzes) * 100)
          : 0;

      // =========================
      // LAST ACTIVITY
      // =========================
      const quizActivities =
        user.quiz_answers
          .filter((quiz: any) => quiz.updatedAt)
          .map((quiz: any) => quiz.updatedAt) || [];

      const courseVideoActivities =
        user.completed_videos
          .filter(
            (video: any) => video.courseId === course.id && video.updatedAt,
          )
          .map((video: any) => video.updatedAt) || [];

      const latestActivity =
        courseVideoActivities.length > 0 || quizActivities.length > 0
          ? new Date(
              Math.max(
                ...quizActivities.map((date: Date) => new Date(date).getTime()),
                ...courseVideoActivities.map((date: Date) =>
                  new Date(date).getTime(),
                ),
              ),
            )
          : null;

      // =========================
      // PAYMENT
      // =========================

      const paymentStatus = user.paymentStatus.find(
        (payment: any) => payment?.courseId === course?.id,
      );
      const paymentInstallments = paymentStatus?.paymentInstallments || [];

      let amountPaid = 0,
        totalAmount = 0,
        installmentsPaid = 0,
        allInstallments = 0;

      if (!paymentStatus?.paymentPlan?.includes("FULL")) {
        paymentInstallments.forEach((installment) => {
          if (installment.paid) {
            amountPaid += Number(installment.amount || 0);
            installmentsPaid += 1;
          }
          totalAmount += Number(installment.amount || 0);
          allInstallments += 1;
        });
      } else {
        paymentStatus.transactions.forEach((transaction) => {
          if (transaction.status === "success") {
            amountPaid += Number(transaction.amount || 0);
          }
          totalAmount += Number(transaction.amount || 0);
        });
      }

      let finalStatusOfPayment: string | undefined = paymentStatus?.status;

      if (allInstallments && installmentsPaid < allInstallments) {
        finalStatusOfPayment = `${installmentsPaid}/${allInstallments} Success`;
      }

      const nextInstallment =
        paymentInstallments.find((installment: any) => !installment.paid) ||
        null;

      return {
        ...purchase,

        courseStats: {
          // VIDEO
          totalVideos,
          completedVideos,
          videoProgressPercentage,

          // QUIZ
          totalQuizzes,
          completedQuizzes,
          quizProgressPercentage,

          // ACTIVITY
          lastActivityAt: latestActivity,

          // PAYMENT
          paymentStatus: finalStatusOfPayment || "UNKNOWN",

          paymentPlan: paymentStatus?.paymentPlan || "FULL",

          amountPaid,

          totalAmount,

          nextInstallmentDueDate: nextInstallment?.dueDate || null,

          installments: paymentInstallments,
        },
      };
    });

    const userResponse = {
      ...user,
      hasPassword: !!user.password,
      course_purchased: enrichedCourses,
    };

    // @ts-ignore
    delete userResponse.password;

    return res.status(200).json({
      status: "success",
      message: null,
      data: userResponse,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getUserByEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const user = await prismadb.user.findFirst({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({ message: "Nonexistent User!" });
    }

    return res
      .status(200)
      .json({ status: "success", message: null, data: user });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getUserWithoutAuth = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prismadb.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ message: "Nonexistent User!" });
    }

    return res
      .status(200)
      .json({ status: "success", message: null, data: user });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { name, email, password, image } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "UserId is required" });
    }

    // Check if the user exists
    const existingUser = await prismadb.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if email is already in use by another user
    if (email && email !== existingUser.email) {
      const emailExists = await prismadb.user.findUnique({
        where: { email },
      });

      if (emailExists && emailExists.id !== userId) {
        return res.status(403).json({ message: "Email already in use" });
      }
    }

    // Update user data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      updateData.password = hashedPassword;
    }
    if (image !== undefined) {
      updateData.image = image;
    }

    // Update the user
    const updatedUser = await prismadb.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        completed_videos: true,
        course_purchased: {
          select: {
            id: true,
            userId: true,
            courseId: true,
            course: true,
          },
        },
        cohorts: {
          select: {
            cohortId: true,
            userId: true,
            isPaymentActive: true,
            isActive: true,
            archivedAt: true,
            cohort: {
              select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                courseId: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        quiz_answers: {
          include: {
            quizAnswer: true,
          },
        },
        paymentStatus: true,
        quiz_leaderboard: {
          select: {
            points: true,
            quizId: true,
            userId: true,
          },
        },
      },
    });

    // Prepare user data for frontend
    const userResponse = {
      ...updatedUser,
      hasPassword: !!updatedUser.password,
    };
    // @ts-ignore
    delete userResponse.password;

    return res.status(200).json({
      status: "success",
      message: "User updated successfully",
      data: userResponse,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const updateUserImage = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { image } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "UserId is required" });
    }

    // Check if the user exists
    const existingUser = await prismadb.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update just the image field
    const updatedUser = await prismadb.user.update({
      where: { id: userId },
      data: { image },
      include: {
        completed_videos: true,
        course_purchased: {
          select: {
            id: true,
            userId: true,
            courseId: true,
            course: true,
          },
        },
        cohorts: {
          select: {
            cohortId: true,
            userId: true,
            isPaymentActive: true,
            isActive: true,
            archivedAt: true,
            cohort: {
              select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                courseId: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        quiz_answers: {
          include: {
            quizAnswer: true,
          },
        },
        paymentStatus: true,
        quiz_leaderboard: {
          select: {
            points: true,
            quizId: true,
            userId: true,
          },
        },
      },
    });

    return res.status(200).json({
      status: "success",
      message: "Profile image updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const existingUser = await prismadb.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "Nonexistent User!" });
    }

    await prismadb.$transaction(
      async (prisma) => {
        // 1. Paystack Transactions
        await prisma.paystackTransaction.deleteMany({
          where: { userId },
        });

        // 2. Assignment Submissions (as student)
        await prisma.assignmentSubmission.deleteMany({
          where: { studentId: userId },
        });

        // 3. Assignment Quiz Submissions
        await prisma.assignmentQuizSubmission.deleteMany({
          where: { studentId: userId },
        });

        // 4. Stream Posts
        await prisma.streamPost.deleteMany({
          where: { authorId: userId },
        });

        // 5. Announcements
        await prisma.announcement.deleteMany({
          where: { authorId: userId },
        });

        // 6. Comments
        await prisma.comment.deleteMany({
          where: { authorId: userId },
        });

        // 7. Scholarship Applications
        await prisma.scholarshipApplication.deleteMany({
          where: { userId },
        });

        // 8. Lead Data (clear potential duplicates in lead tables by email)
        if (existingUser.email) {
          await prisma.programLeads.deleteMany({
            where: { email: existingUser.email },
          });
          await prisma.freeCourseApplication.deleteMany({
            where: { email: existingUser.email },
          });
          await prisma.masterClassRegistration.deleteMany({
            where: { email: existingUser.email },
          });
        }

        // 9. Clear processedBy reference in ChangeRequests and gradedBy in AssignmentSubmissions
        await prisma.changeRequest.updateMany({
          where: { processedById: userId },
          data: { processedById: null },
        });

        await prisma.assignmentSubmission.updateMany({
          where: { gradedById: userId },
          data: { gradedById: null },
        });

        // 10. Purchased courses
        await prisma.purchase.deleteMany({
          where: { userId },
        });

        console.log("All related data for this user has been deleted");

        const user = await prisma.user.delete({
          where: { id: userId },
        });

        console.log("User has been deleted");

        return user;
      },
      {
        maxWait: 15000, // 15 seconds
        timeout: 60000, // 60 seconds
      },
    );

    // Example of how to call the function
    await sendAccountDeletionEmail({
      email: existingUser.email || "",
      name: existingUser.name,
    });

    return res.status(200).json({
      status: "success",
      message: `User with id: ${userId} deleted`,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const userId = req.params?.userId;

    const { role }: { role: UserRole } = req.body;

    if (!role) {
      return res.status(400).json({ message: "Invalid field" });
    }

    const existingUser = await prismadb.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "Nonexistent User!" });
    }

    await prismadb.user.update({
      data: {
        role: role,
      },
      where: {
        id: existingUser.id,
      },
    });

    return res
      .status(200)
      .json({ status: "success", message: "User role updated!" });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const addUserCourse = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { courseId, cohortId } = req.body;

    if (!userId || !courseId) {
      return res
        .status(400)
        .json({ message: "UserId and CourseId are required" });
    }

    const user = await prismadb.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const course = await prismadb.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Checking if user already has this course
    const existingPurchase = await prismadb.purchase.findFirst({
      where: {
        userId,
        courseId,
      },
    });

    if (existingPurchase) {
      return res.status(400).json({ message: "User already has this course" });
    }

    let courseCohortId = cohortId;
    // Finding the latest cohort for this course
    if (!cohortId) {
      const latestCohort = await prismadb.cohort.findFirst({
        where: {
          courseId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      courseCohortId = latestCohort?.id;
    }

    if (!courseCohortId) {
      return res
        .status(400)
        .json({ message: "This course does not have a cohort" });
    }

    // Add the course to user
    const purchase = await prismadb.purchase.create({
      data: {
        userId,
        courseId,
      },
    });

    // Update user's ongoing courses if not included
    await prismadb.user.update({
      where: { id: userId },
      data: {
        ongoing_courses: {
          push: courseId,
        },
      },
    });
    await prismadb.userCohort.create({
      data: {
        userId,
        cohortId: courseCohortId,
        courseId,
        isPaymentActive: true,
      },
    });

    return res.status(200).json({
      status: "success",
      message: "Course added and user enrolled in cohort",
      data: {
        purchase,
        cohort: { id: courseCohortId },
      },
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const removeUserCourse = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { courseId } = req.body;

    if (!userId || !courseId) {
      return res
        .status(400)
        .json({ message: "UserId and CourseId are required" });
    }

    const user = await prismadb.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const course = await prismadb.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const existingPurchase = await prismadb.purchase.findFirst({
      where: {
        userId,
        courseId,
      },
    });

    if (!existingPurchase) {
      return res.status(400).json({ message: "User doesn't have this course" });
    }

    // Remove user from any cohorts associated with this course
    await prismadb.userCohort.deleteMany({
      where: {
        userId,
        courseId,
      },
    });

    // Remove the course purchase
    await prismadb.purchase.deleteMany({
      where: {
        userId,
        courseId,
      },
    });

    // Update user's ongoing and completed courses arrays
    await prismadb.user.update({
      where: { id: userId },
      data: {
        ongoing_courses: {
          set: user.ongoing_courses.filter((id) => id !== courseId),
        },
        completed_courses: {
          set: user.completed_courses.filter((id) => id !== courseId),
        },
      },
    });

    return res.status(200).json({
      status: "success",
      message: "Course removed from user successfully",
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const updateUserCohort = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { cohortId, courseId, reason } = req.body;

    if (!userId || !cohortId || !courseId) {
      return res.status(400).json({
        message: "UserId, cohortId and courseId are required",
      });
    }

    const [currentEnrollment, newCohort, user] = await Promise.all([
      prismadb.userCohort.findFirst({
        where: {
          userId,
          isActive: true,
          courseId,
        },
        include: {
          cohort: {
            select: {
              id: true,
              name: true,
              courseId: true,
            },
          },
        },
      }),

      prismadb.cohort.findUnique({
        where: { id: cohortId },
        select: {
          id: true,
          name: true,
          courseId: true,
        },
      }),

      prismadb.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          id: true,
        },
      }),
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!currentEnrollment) {
      return res.status(404).json({
        message: "User is not enrolled in the specified current cohort",
      });
    }

    if (currentEnrollment.cohortId === cohortId) {
      return res.status(400).json({
        message: "New cohort must be different from current cohort",
      });
    }

    if (!newCohort) {
      return res.status(404).json({
        message: "New cohort not found",
      });
    }

    if (newCohort.courseId !== currentEnrollment.cohort.courseId) {
      return res.status(400).json({
        message: "New cohort must be for the same course",
      });
    }

    const result = await prismadb.$transaction(async (tx) => {
      const archivedEnrollment = await tx.userCohort.updateMany({
        where: { courseId, userId },
        data: {
          isActive: false,
          archivedAt: new Date(),
          isPaymentActive: false,
        },
      });

      const newEnrollment = await tx.userCohort.upsert({
        where: {
          userId_cohortId_courseId: {
            userId,
            cohortId,
            courseId,
          },
        },
        create: {
          userId,
          cohortId,
          courseId,
          isPaymentActive: currentEnrollment.isPaymentActive,
          isActive: true,
          previousEnrollmentId: currentEnrollment.id,
        },
        update: {
          isPaymentActive: currentEnrollment.isPaymentActive,
          isActive: true,
          previousEnrollmentId: currentEnrollment.id,
        },
      });

      await tx.notification.create({
        data: {
          userId,
          type: "COHORT_SWITCHED",
          title: "Cohort Updated",
          message: `Your cohort has been switched to ${newCohort.name}`,
          details: JSON.stringify({
            oldCohortId: currentEnrollment.cohortId,
            newCohortId: cohortId,
            courseId,
            reason,
          }),
        },
      });

      return {
        previousCohort: archivedEnrollment,
        newCohort: newEnrollment,
      };
    });

    if (user.email) {
      const html = `
        <h2>Cohort Update</h2>
        <p>Hi ${user.name || "there"},</p>
        <p>Your cohort has been switched to <strong>${newCohort.name}</strong>.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
        <p>Please log in to your account to see the details.</p>
      `;
      await sendMail({
        to: user.email,
        subject: "Your Cohort Has Been Updated",
        html,
      });
    }

    return res.status(200).json({
      status: "success",
      message: "User cohort updated successfully",
      data: result,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getUserCourseProgress = async (req: Request, res: Response) => {
  try {
    const { userId, courseId } = req.params;

    if (!userId || !courseId) {
      return res
        .status(400)
        .json({ message: "UserId and CourseId are required" });
    }

    // Get user with their completed videos for this course
    const user = await prismadb.user.findUnique({
      where: { id: userId },
      include: {
        completed_videos: {
          where: { courseId },
          select: { videoId: true, isCompleted: true },
        },
        cohorts: {
          where: { courseId },
          include: {
            cohort: {
              select: {
                startDate: true,
                cohortCourses: {
                  where: { courseId },
                  include: {
                    cohortWeeks: {
                      include: {
                        cohortModules: {
                          include: {
                            cohortProjectVideos: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        course_purchased: {
          where: { courseId },
          include: {
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
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get the course purchase
    const coursePurchase = user.course_purchased.find(
      (p) => p.courseId === courseId,
    );
    if (!coursePurchase) {
      return res
        .status(404)
        .json({ message: "User hasn't purchased this course" });
    }

    // Calculate progress data
    const course = coursePurchase.course;
    const cohort = user.cohorts[0]?.cohort;
    const cohortCourse = cohort?.cohortCourses[0];

    // Calculate total videos in course
    const totalVideos =
      course?.course_weeks?.reduce((weekAcc, week) => {
        return (
          weekAcc +
          week.courseModules.reduce(
            (moduleAcc, module) => moduleAcc + module.projectVideos.length,
            0,
          )
        );
      }, 0) || 0;

    // Calculate completed videos
    const completedVideos = user.completed_videos.filter(
      (v) => v.isCompleted,
    ).length;

    // Calculate progress percentage
    const progressPercentage =
      totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;

    // Calculate expected progress based on cohort start date
    let expectedWeek = 1;
    let expectedProgress = 0;
    let weeksBehind = 0;

    if (cohort && cohortCourse) {
      const cohortStartDate = new Date(cohort.startDate);
      const now = new Date();
      const daysSinceStart = Math.floor(
        (now.getTime() - cohortStartDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      expectedWeek = Math.min(
        Math.floor(daysSinceStart / 7) + 1, // +1 because first week is week 1
        cohortCourse.cohortWeeks.length,
      );

      // Calculate expected progress based on weeks
      if (cohortCourse.cohortWeeks.length > 0) {
        const videosPerWeek = totalVideos / cohortCourse.cohortWeeks.length;
        expectedProgress = Math.min(
          Math.round(((expectedWeek * videosPerWeek) / totalVideos) * 100),
          100,
        );
      }

      // Calculate how many weeks behind
      if (cohortCourse.cohortWeeks.length > 0) {
        // Find the last week where the user has completed all videos
        let actualWeek = 0;
        for (const week of cohortCourse.cohortWeeks) {
          const weekVideos = week.cohortModules.flatMap(
            (m) => m.cohortProjectVideos,
          );
          const completedWeekVideos = weekVideos.filter((v) =>
            user.completed_videos.some(
              (cv) => cv.videoId === v.id && cv.isCompleted,
            ),
          ).length;

          if (completedWeekVideos >= weekVideos.length * 0.8) {
            // 80% completion to count as "done"
            actualWeek++;
          } else {
            break;
          }
        }
        weeksBehind = Math.max(0, expectedWeek - actualWeek - 1);
      }
    }

    // Get module-level progress
    const modulesProgress =
      course?.course_weeks?.flatMap((week) =>
        week.courseModules.map((module) => ({
          id: module.id,
          title: module.title,
          totalVideos: module.projectVideos.length,
          completedVideos: module.projectVideos.filter((video) =>
            user.completed_videos.some(
              (cv) => cv.videoId === video.id && cv.isCompleted,
            ),
          ).length,
          iconUrl: module.iconUrl,
          status:
            module.projectVideos.length > 0
              ? user.completed_videos.filter((cv) =>
                  module.projectVideos.some(
                    (v) => v.id === cv.videoId && cv.isCompleted,
                  ),
                ).length /
                  module.projectVideos.length >=
                0.8
                ? "Completed"
                : "Ongoing"
              : "N/A",
        })),
      ) || [];

    return res.status(200).json({
      status: "success",
      data: {
        userId,
        courseId,
        courseTitle: course?.title,
        totalVideos,
        completedVideos,
        progressPercentage,
        expectedProgress,
        weeksBehind,
        expectedWeek,
        currentWeek: cohortCourse?.cohortWeeks?.length
          ? Math.min(expectedWeek, cohortCourse.cohortWeeks.length)
          : 1,
        totalWeeks: cohortCourse?.cohortWeeks?.length || 0,
        modulesProgress,

        cohortStartDate: cohort?.startDate,
        isOnTrack: weeksBehind <= 1,
      },
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

// Switch user to a different course
export const switchUserCourse = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { newCourseId, newCohortId, reason } = req.body;

    if (!userId || !newCourseId || !newCohortId) {
      return res.status(400).json({
        message: "UserId, newCourseId, and newCohortId are required",
      });
    }

    // Get user with current courses and cohorts
    const user = await prismadb.user.findUnique({
      where: { id: userId },
      include: {
        cohorts: {
          include: { cohort: true },
        },
        course_purchased: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get new course and cohort info
    const newCourse = await prismadb.course.findUnique({
      where: { id: newCourseId },
    });

    const newCohort = await prismadb.cohort.findUnique({
      where: { id: newCohortId },
      include: { course: true },
    });

    if (!newCourse) {
      return res.status(404).json({ message: "New course not found" });
    }

    if (!newCohort) {
      return res.status(404).json({ message: "New cohort not found" });
    }

    // Verify new cohort is for the new course
    if (newCohort.courseId !== newCourseId) {
      return res.status(400).json({
        message: "Cohort must belong to the selected course",
      });
    }

    // Archive all current enrollments (cohorts for all courses)
    const activeCohorts = user.cohorts.filter((c) => c.isActive);
    for (const cohort of activeCohorts) {
      await prismadb.userCohort.update({
        where: { id: cohort.id },
        data: {
          isActive: false,
          archivedAt: new Date(),
          isPaymentActive: false,
        },
      });
    }

    // Remove all course purchases
    await prismadb.purchase.deleteMany({
      where: { userId },
    });

    // Create new course purchase
    await prismadb.purchase.create({
      data: {
        userId,
        courseId: newCourseId,
      },
    });

    // Create new cohort enrollment
    const newEnrollment = await prismadb.userCohort.create({
      data: {
        userId,
        cohortId: newCohortId,
        courseId: newCourseId,
        isActive: true,
      },
      include: { cohort: true },
    });

    // Create notification for course switch
    await prismadb.notification.create({
      data: {
        userId,
        type: "COURSE_SWITCHED",
        title: "Course Updated",
        message: `Your course has been switched to ${newCourse.title}`,
        details: JSON.stringify({
          newCourseId,
          newCohortId,
          courseName: newCourse.title,
          cohortName: newCohort.name,
          reason,
        }),
      },
    });

    // Send email notification
    if (user.email) {
      const html = `
        <h2>Course Update</h2>
        <p>Hi ${user.name || "there"},</p>
        <p>Your course has been switched to <strong>${newCourse.title}</strong> in cohort <strong>${newCohort.name}</strong>.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
        <p>Please log in to your account to see the details.</p>
      `;
      await sendMail({
        to: user.email,
        subject: "Your Course Has Been Updated",
        html,
      });
    }

    return res.status(200).json({
      status: "success",
      message: "User course switched successfully",
      data: newEnrollment,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

// Switch user to a different cohort for same course
export const switchUserCohort = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { currentCohortId, newCohortId, courseId, reason } = req.body;

    if (!userId || !currentCohortId || !newCohortId || !courseId) {
      return res.status(400).json({
        message:
          "UserId, currentCohortId, newCohortId, and courseId are required",
      });
    }

    // Get user
    const user = await prismadb.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get current enrollment
    const currentEnrollment = await prismadb.userCohort.findUnique({
      where: {
        userId_cohortId_courseId: {
          userId,
          cohortId: currentCohortId,
          courseId,
        },
      },
      include: { cohort: true },
    });

    if (!currentEnrollment) {
      return res.status(404).json({
        message: "User is not enrolled in the specified cohort",
      });
    }

    // Get new cohort
    const newCohort = await prismadb.cohort.findUnique({
      where: { id: newCohortId },
    });

    if (!newCohort) {
      return res.status(404).json({ message: "New cohort not found" });
    }

    // Verify both cohorts are for the same course
    if (newCohort.courseId !== courseId) {
      return res.status(400).json({
        message: "New cohort must be for the same course",
      });
    }

    // Archive current enrollment
    await prismadb.userCohort.update({
      where: { id: currentEnrollment.id },
      data: {
        isActive: false,
        archivedAt: new Date(),
        isPaymentActive: false,
      },
    });

    // Create new enrollment
    const newEnrollment = await prismadb.userCohort.create({
      data: {
        userId,
        cohortId: newCohortId,
        courseId,
        isActive: true,
        previousEnrollmentId: currentEnrollment.id,
      },
      include: { cohort: true },
    });

    // Create notification
    await prismadb.notification.create({
      data: {
        userId,
        type: "COHORT_SWITCHED",
        title: "Cohort Updated",
        message: `Your cohort has been switched to ${newCohort.name}`,
        details: JSON.stringify({
          oldCohortId: currentCohortId,
          newCohortId,
          courseId,
          reason,
        }),
      },
    });

    // Send email notification
    if (user.email) {
      const html = `
        <h2>Cohort Update</h2>
        <p>Hi ${user.name || "there"},</p>
        <p>Your cohort has been switched to <strong>${newCohort.name}</strong>.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
        <p>Please log in to your account to see the details.</p>
      `;
      await sendMail({
        to: user.email,
        subject: "Your Cohort Has Been Updated",
        html,
      });
    }

    return res.status(200).json({
      status: "success",
      message: "User cohort switched successfully",
      data: newEnrollment,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};
