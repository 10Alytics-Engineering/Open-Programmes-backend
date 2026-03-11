import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";

export const updateUserCohort = async (req: Request, res: Response) => {
  try {
    const { cohortId } = req.params;
    const {
      userId,
      courseId,
      newCohortId,
    }: { userId: string; courseId: string; newCohortId: string } = req.body;

    if (!newCohortId) {
      return res.status(400).json({ message: "New CohortId is required" });
    }

    if (!cohortId) {
      return res.status(400).json({ message: "CohortId is required" });
    }

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!userId) {
      return res.status(400).json({ message: "UserId is required" });
    }

    const user = await prismadb.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User does not exist" });
    }

    const existingCohort = await prismadb.cohort.findUnique({
      where: {
        id: cohortId,
      },
    });

    if (!existingCohort) {
      return res.status(404).json({ message: "Cohort not found" });
    }

    // Find the existing UserCohort record
    const userCohort = await prismadb.userCohort.findUnique({
      where: {
        userId_cohortId_courseId: {
          userId,
          cohortId,
          courseId,
        },
      },
    });

    if (!userCohort) {
      return res.status(404).json({ message: "UserCohort not found" });
    }

    // Check if the new cohortId combination is unique
    const existingRecord = await prismadb.userCohort.findUnique({
      where: {
        userId_cohortId_courseId: {
          userId,
          cohortId: newCohortId,
          courseId,
        },
      },
    });

    if (existingRecord) {
      return res.status(400).json({
        message:
          "User is already enrolled in the specified cohort for the course",
      });
    }

    // Update the UserCohort record
    await prismadb.userCohort.update({
      data: {
        cohortId: newCohortId,
      },
      where: {
        id: userCohort.id,
      },
    });

    res.status(200).json({ status: "User's Cohort updated", message: null });
  } catch (error) {
    return res.status(500).json({ UPDATE_USER_COHORT: error });
  }
};
