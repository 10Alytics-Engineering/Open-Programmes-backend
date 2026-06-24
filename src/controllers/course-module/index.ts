import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import {
  attachSignedUrls,
  generateSignedFileUrl,
} from "../../services/upload.service";

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
        createdAt: "asc",
      },
    });

    const modulesWithIconUrls = await attachSignedUrls({
      items: modules,
      keyField: "iconKey",
      urlField: "iconUrl",
    });

    return res
      .status(200)
      .json({ status: "success", message: null, data: modulesWithIconUrls });
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

    const iconUrl = module.iconKey
      ? await generateSignedFileUrl(module.iconKey || "")
      : module.iconUrl || "";

    const projectVideosWithThumbnails = await attachSignedUrls({
      items: module.projectVideos,
      keyField: "thumbnailKey",
      urlField: "thumbnailUrl",
    });

    return res.status(200).json({
      status: "success",
      message: null,
      data: {
        ...module,
        iconUrl,
        projectVideos: projectVideosWithThumbnails,
      },
    });
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

    await prismadb.$transaction(async (tx) => {
      await tx.module.delete({
        where: {
          id: moduleId,
        },
      });

      const freeModulesCount = await tx.module.count({
        where: {
          isFree: true,
          CourseWeek: {
            courseId,
          },
        },
      });

      await tx.course.update({
        where: {
          id: courseId,
        },
        data: {
          hasFreeModules: freeModulesCount > 0,
        },
      });
    });

    return res.status(200).json({
      status: "success",
      message: "Deleted course module successfully",
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const updateModuleFreeStatus = async (req: Request, res: Response) => {
  const { courseId, moduleId } = req.params;
  const { isFree } = req.body;

  console.log({ isFree });

  if (!courseId || !moduleId) {
    return res.status(400).json({
      message: "Course id and module id are required",
    });
  }

  if (typeof isFree !== "boolean") {
    return res.status(400).json({
      message: "isFree must be true or false",
    });
  }

  try {
    const courseModule = await prismadb.module.findFirst({
      where: {
        id: moduleId,
        CourseWeek: {
          courseId,
        },
      },
    });

    if (!courseModule) {
      return res.status(404).json({
        message: "Module not found",
      });
    }

    const updatedModule = await prismadb.$transaction(async (tx) => {
      const module = await tx.module.update({
        where: {
          id: moduleId,
        },
        data: {
          isFree,
        },
      });

      const freeModulesCount = await tx.module.count({
        where: {
          isFree: true,
          CourseWeek: {
            courseId,
          },
        },
      });

      await tx.course.update({
        where: {
          id: courseId,
        },
        data: {
          hasFreeModules: freeModulesCount > 0,
        },
      });

      return module;
    });

    return res.status(200).json({
      status: "success",
      message: "Module free status updated successfully",
      data: updatedModule,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};
