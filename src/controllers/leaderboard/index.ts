import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";

interface LeaderboardEntry {
  userId: string;
  quizPoints: number;
  completedVideos: number;
  hasCompletedCourse: boolean;
  user?: {
    id: string;
    name: string;
    image: string | null;
  };
}

export const getCohortLeaderboard = async (req: Request, res: Response) => {
  try {
    const { cohortId } = req.params;

    if (!cohortId) {
      return res.status(400).json({ error: "Cohort ID is required" });
    }

    // 1. Get cohort and verify existence
    const cohort = await prismadb.cohort.findUnique({
      where: { id: cohortId },
      select: {
        id: true,
        name: true,
        courseId: true,
        users: {
          // Directly fetch cohort users with their relationships
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                completed_courses: true,
              },
            },
          },
        },
      },
    });

    if (!cohort) {
      return res.status(404).json({ error: "Cohort not found" });
    }

    const cohortUserEntries = cohort.users;
    const userIds = cohortUserEntries.map((u) => u.userId);

    if (userIds.length === 0) {
      return res.status(200).json([]);
    }

    // 2. Get metrics ONLY for users in this cohort
    const [quizResults, videoProgress] = await Promise.all([
      // Quiz points (filtered by cohort users AND cohort course)
      prismadb.leaderboard.groupBy({
        by: ["userId"],
        where: {
          userId: { in: userIds },
          quiz: {
            courseModule: {
              CourseWeek: { courseId: cohort.courseId },
            },
          },
        },
        _sum: { points: true },
      }),
      // Video completions (filtered by cohort users AND cohort course)
      prismadb.userProgress.findMany({
        where: {
          userId: { in: userIds },
          courseId: cohort.courseId,
          isCompleted: true,
        },
        select: { userId: true, videoId: true },
      }),
    ]);

    // 3. Transform data using the pre-fetched user details
    const leaderboard = cohortUserEntries.map(({ userId, user }) => {
      const quizEntry = quizResults.find((r) => r.userId === userId);
      const videoCount = videoProgress.filter(
        (v) => v.userId === userId
      ).length;
      const hasCompletedCourse =
        user?.completed_courses.includes(cohort.courseId) || false;

      return {
        userId,
        quizPoints: quizEntry?._sum.points || 0,
        completedVideos: videoCount,
        hasCompletedCourse,
        user: {
          id: user.id,
          name: user.name,
          image: user.image,
        },
      };
    });

    // 4. Sort (same logic as before)
    const sortedLeaderboard = leaderboard.sort((a, b) => {
      if (a.hasCompletedCourse !== b.hasCompletedCourse) {
        return b.hasCompletedCourse ? 1 : -1;
      }
      if (a.quizPoints !== b.quizPoints) {
        return b.quizPoints - a.quizPoints;
      }
      return b.completedVideos - a.completedVideos;
    });

    // 5. Add ranks
    const rankedLeaderboard = sortedLeaderboard.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    res.status(200).json({
      cohort: {
        id: cohort.id,
        name: cohort.name,
        courseId: cohort.courseId,
      },
      leaderboard: rankedLeaderboard,
    });
  } catch (error: any) {
    console.error("Cohort leaderboard error:", error);
    res.status(500).json({
      error: "Failed to fetch cohort leaderboard",
      details: error?.message,
    });
  }
};
