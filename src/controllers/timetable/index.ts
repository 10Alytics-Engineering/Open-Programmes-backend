import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { EventCategory } from "@prisma/client";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const getTimetables = async (req: Request, res: Response) => {
  try {
    const timetables = await prismadb.timeTable.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    res
      .status(200)
      .json({ status: "success", message: null, data: timetables });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getTimetable = async (req: Request, res: Response) => {
  try {
    const { timetableId } = req.params;

    if (!timetableId) {
      return res.status(400).json({ message: "Timetable ID is required" });
    }

    const timetable = await prismadb.timeTable.findUnique({
      where: {
        id: timetableId,
      },
    });

    res.status(200).json({ status: "success", message: null, data: timetable });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const updateTimetable = async (req: Request, res: Response) => {
  try {
    const { timetableId } = req.params;

    const body = req.body;

    if (!timetableId) {
      return res.status(400).json({ message: "Timetable ID is required" });
    }

    const timeTable = await prismadb.timeTable.findUnique({
      where: {
        id: timetableId,
      },
    });

    if (!timeTable) {
      return res.status(404).json({ message: "Timetable not found" });
    }

    await prismadb.timeTable.update({
      data: {
        ...body,
      },
      where: {
        id: timetableId,
      },
    });

    res.status(200).json({
      status: "success",
      message: null,
      data: "Timetable updated successfully",
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const deleteTimetable = async (req: Request, res: Response) => {
  try {
    const { timetableId } = req.params;

    if (!timetableId) {
      return res.status(400).json({ message: "Timetable ID is required" });
    }

    const timeTable = await prismadb.timeTable.findUnique({
      where: {
        id: timetableId,
      },
    });

    if (!timeTable) {
      return res.status(404).json({ message: "Timetable not found" });
    }

    await prismadb.timeTable.delete({
      where: {
        id: timetableId,
      },
    });

    res.status(200).json({
      status: "success",
      message: null,
      data: "Timetable deleted successfully",
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const createTimetable = async (req: Request, res: Response) => {
  const {
    name,
    category,
    courseId,
  }: {
    name: string;
    category: EventCategory;
    courseId: string;
  } = req.body;

  if (!name) {
    return res.status(400).json({ message: "name is required" });
  }

  if (!category) {
    return res.status(400).json({ message: "Category is required" });
  }

  if (!courseId) {
    return res.status(400).json({ message: "CohortId is required" });
  }

  try {
    const timetable = await prismadb.timeTable.create({
      data: {
        name,
        category,
        courseId,
      },
    });

    res.status(201).json({
      status: "success",
      message: "Timetable created successfully",
      data: timetable,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};
