import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const getCourseWeeks = async (req: Request, res: Response) => {
  const { courseId } = req.params;

  if (!courseId) {
    return res.status(400).json({ message: "CourseId is required" });
  }

  try {
    const courseWeeks = await prismadb.courseWeek.findMany({
      where: {
        courseId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return res
      .status(200)
      .json({ status: "success", message: null, data: courseWeeks });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getCourseWeek = async (req: Request, res: Response) => {
  try {
    const { courseId, weekId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    const course = await prismadb.course.findUnique({
      where: {
        id: courseId,
      },
    });

    if (!course) {
      return res.status(404).json({ message: "Course does not exist" });
    }

    const courseWeek = await prismadb.courseWeek.findUnique({
      where: {
        id: weekId,
      },
      include: {
        attachments: true,
        courseModules: {
          include: {
            projectVideos: true,
          },
        },
      },
    });

    if (!courseWeek) {
      return res.status(404).json({ message: "Course week does not exist" });
    }

    return res
      .status(200)
      .json({ status: "success", message: null, data: courseWeek });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const createCourseWeek = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const { title }: { title: string } = req.body;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const courseWeek = await prismadb.courseWeek.create({
      data: {
        title,
        courseId,
      },
      select: {
        id: true,
        title: true,
      },
    });

    return res
      .status(201)
      .json({ status: "Course week created", message: null, data: courseWeek });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const updateCourseWeek = async (req: Request, res: Response) => {
  try {
    const body = req.body;

    const { courseId, weekId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    const course = await prismadb.course.findUnique({
      where: {
        id: courseId,
      },
    });

    if (!course) {
      return res.status(404).json({ message: "Course does not exist" });
    }

    const updatedCourseWeek = await prismadb.courseWeek.update({
      where: {
        id: weekId,
      },
      data: {
        ...body,
      },
    });

    return res
      .status(200)
      .json({
        status: "Course week updated",
        message: null,
        data: updatedCourseWeek,
      });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const deleteCourseWeek = async (req: Request, res: Response) => {
  try {
    const { courseId, weekId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    const course = await prismadb.course.findUnique({
      where: {
        id: courseId,
      },
    });

    if (!course) {
      return res.status(404).json({ message: "Course does not exist" });
    }

    // Use a transaction to ensure atomicity
    await prismadb.$transaction(async (tx) => {
      // First, delete all related Module records
      await tx.module.deleteMany({
        where: {
          courseWeekId: weekId,
        },
      });

      // Then delete the CourseWeek
      await tx.courseWeek.delete({
        where: {
          id: weekId,
        },
      });
    });

    return res.status(200).json({ status: "Course week and related modules deleted" });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const publishCourseWeek = async (req: Request, res: Response) => {
  try {
    const { courseId, weekId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    const course = await prismadb.course.findUnique({
      where: {
        id: courseId,
      },
    });

    if (!course) {
      return res.status(404).json({ message: "Course does not exist" });
    }

    const updatedCourseWeek = await prismadb.courseWeek.update({
      where: {
        id: weekId,
      },
      data: {
        isPublished: true,
      },
    });

    return res
      .status(200)
      .json({
        status: "Course week updated",
        message: null,
        data: updatedCourseWeek,
      });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const unPublishCourseWeek = async (req: Request, res: Response) => {
  try {
    const { courseId, weekId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    const course = await prismadb.course.findUnique({
      where: {
        id: courseId,
      },
    });

    if (!course) {
      return res.status(404).json({ message: "Course does not exist" });
    }

    const updatedCourseWeek = await prismadb.courseWeek.update({
      where: {
        id: weekId,
      },
      data: {
        isPublished: false,
      },
    });

    return res
      .status(200)
      .json({
        status: "Course week updated",
        message: null,
        data: updatedCourseWeek,
      });
  } catch (error) {
    handleServerError(error, res);
  }
};
