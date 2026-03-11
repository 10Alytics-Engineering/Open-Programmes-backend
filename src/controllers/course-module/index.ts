import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const getModules = async (req: Request, res: Response) => {
  try {
    const { courseId, weekId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    const existingCourseWeek = await prismadb.courseWeek.findUnique({
      where: {
        id: weekId,
      },
    });

    if (!existingCourseWeek) {
      return res.status(404).json({ message: "Course week does not exist" });
    }

    const modules = await prismadb.module.findMany({
      where: {
        courseWeekId: weekId,
      },
      include: {
        projectVideos: true,
        quizzes: {
          include: {
            answers: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return res
      .status(200)
      .json({ status: "success", message: null, data: modules });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getModule = async (req: Request, res: Response) => {
  try {
    const { courseId, weekId, moduleId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    if (!moduleId) {
      return res.status(400).json({ message: "ModuleId is required" });
    }

    const existingCourseWeek = await prismadb.courseWeek.findUnique({
      where: {
        id: weekId,
      },
    });

    if (!existingCourseWeek) {
      return res.status(404).json({ message: "Course week does not exist" });
    }

    const module = await prismadb.module.findUnique({
      where: {
        id: moduleId,
        courseWeekId: weekId,
      },
      include: {
        projectVideos: true,
        quizzes: {
          include: {
            answers: true,
          },
        },
      },
    });

    if (!module) {
      return res.status(404).json({ message: "Module does not exist" });
    }

    return res
      .status(200)
      .json({ status: "success", message: null, data: module });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const createModule = async (req: Request, res: Response) => {
  try {
    const { title }: { title: string } = req.body;
    const { courseId, weekId } = req.params;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    const existingCourseWeek = await prismadb.courseWeek.findUnique({
      where: {
        id: weekId,
      },
    });

    if (!existingCourseWeek) {
      return res.status(404).json({ message: "Course week does not exist" });
    }

    const module = await prismadb.module.create({
      data: {
        title,
        courseWeekId: weekId,
      },
      select: {
        id: true,
        title: true,
      },
    });

    return res
      .status(201)
      .json({ status: "Course module created", message: null, data: module });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const updateModule = async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const { courseId, weekId, moduleId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    if (!moduleId) {
      return res.status(400).json({ message: "ModuleId is required" });
    }

    const existingCourseWeek = await prismadb.courseWeek.findUnique({
      where: {
        id: weekId,
      },
    });

    if (!existingCourseWeek) {
      return res.status(404).json({ message: "Course week does not exist" });
    }

    await prismadb.module.update({
      where: {
        id: moduleId,
      },
      data: {
        ...body,
      },
    });

    return res.status(200).json({ status: "Module updated" });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const deleteModule = async (req: Request, res: Response) => {
  try {
    const { courseId, weekId, moduleId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    if (!moduleId) {
      return res.status(400).json({ message: "ModuleId is required" });
    }

    const existingCourseWeek = await prismadb.courseWeek.findUnique({
      where: {
        id: weekId,
      },
    });

    if (!existingCourseWeek) {
      return res.status(404).json({ message: "Course week does not exist" });
    }

    await prismadb.module.delete({
      where: {
        id: moduleId,
      },
    });

    return res.status(200).json({ status: "Module deleted" });
  } catch (error) {
    handleServerError(error, res);
  }
};
