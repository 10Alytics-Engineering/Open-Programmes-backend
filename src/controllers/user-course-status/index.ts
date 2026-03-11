import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { User } from "@prisma/client";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({
    message: "Internal Server Error",
    UPDATE_USER_COURSE_STATUS: error,
  });
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
      (id) => id !== courseId
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
