import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const getModulesByWeek = async (req: Request, res: Response) => {
  try {
    const { weekId } = req.params;

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    const modules = await prismadb.module.findMany({
      where: { courseWeekId: weekId },
      orderBy: { createdAt: "asc" },
    });

    res.status(200).json({
      status: "success",
      message: null,
      data: modules,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const createModule = async (req: Request, res: Response) => {
  try {
    const { title, description, courseWeekId } = req.body;

    if (!title || !courseWeekId) {
      return res.status(400).json({
        message: "Title and courseWeekId are required",
      });
    }

    const newModule = await prismadb.module.create({
      data: {
        title,
        description: description || "",
        courseWeekId,
      },
    });

    res.status(201).json({
      status: "success",
      message: "Module created successfully",
      data: newModule,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};
