import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { NebiantUser } from "../../middleware";

export const recordAttendance = async (req: Request, res: Response) => {
  try {
    const { liveClassId, userId } = req.body;

    if (!liveClassId || !userId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if attendance already recorded
    const existing = await prismadb.liveClassAttendance.findUnique({
      where: {
        liveClassId_userId: {
          liveClassId,
          userId,
        },
      },
    });

    if (existing) {
      return res.status(200).json({ message: "Attendance already recorded" });
    }

    await prismadb.liveClassAttendance.create({
      data: {
        liveClassId,
        userId,
      },
    });

    res.status(201).json({ message: "Attendance recorded" });
  } catch (error) {
    console.error("Record attendance error:", error);
    res.status(500).json({ error: "Failed to record attendance" });
  }
};

export const getLiveClassesForUser = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const now = new Date();
    
    // Get all cohorts the user is in
    const userCohorts = await prismadb.userCohort.findMany({
      where: { userId: user.id, isActive: true },
    });

    const cohortIds = userCohorts.map(uc => uc.cohortId);

    // Find active live classes for these cohorts
    const activeLiveClasses = await prismadb.liveClass.findMany({
      where: {
        cohortCourse: {
          cohortId: { in: cohortIds },
        },
        startTime: { lte: now },
        endTime: { gte: now },
      },
      include: {
        cohortCourse: {
          include: {
            cohort: true,
            course: true,
          }
        }
      },
      orderBy: { startTime: 'asc' },
    });

    res.json({ activeLiveClasses });
  } catch (error) {
    console.error("Get active live classes error:", error);
    res.status(500).json({ error: "Failed to fetch active live classes" });
  }
};

export const getLiveClassDetails = async (req: Request, res: Response) => {
  try {
    const { liveClassId } = req.params;
    
    const liveClass = await prismadb.liveClass.findUnique({
      where: { id: liveClassId },
      include: {
        cohortCourse: {
          include: {
            cohort: true,
          }
        },
        _count: {
          select: { attendance: true }
        }
      }
    });

    if (!liveClass) {
      return res.status(404).json({ error: "Live class not found" });
    }

    res.json({ liveClass });
  } catch (error) {
    console.error("Get live class details error:", error);
    res.status(500).json({ error: "Failed to fetch live class details" });
  }
};
