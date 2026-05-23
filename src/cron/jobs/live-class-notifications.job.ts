import cron from "node-cron";
import { prismadb } from "../../lib/prismadb";
import { notifyCohortMembers } from "../../utils/liveClassNotifications";

export const registerLiveClassNotificationsJob = () => {
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const in30Mins = new Date(now.getTime() + 30 * 60 * 1000);

    try {
      const soonClasses = await prismadb.liveClass.findMany({
        where: {
          startTime: { lte: in30Mins, gte: now },
          notified30m: false,
        },
      });

      for (const liveClass of soonClasses) {
        await notifyCohortMembers(liveClass.id, "reminder");
      }

      const startingClasses = await prismadb.liveClass.findMany({
        where: {
          startTime: { lte: now },
          endTime: { gte: now },
          notifiedStart: false,
        },
      });

      for (const liveClass of startingClasses) {
        await notifyCohortMembers(liveClass.id, "started");
      }
    } catch (error) {
      console.error("Cron Live Class Notify Error:", error);
    }
  });

  console.log("✅ Live class notifications cron registered");
};
