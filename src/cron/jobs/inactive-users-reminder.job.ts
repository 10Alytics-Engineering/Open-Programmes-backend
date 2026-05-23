import cron from "node-cron";
import { prismadb } from "../../lib/prismadb";
import { genericEmailTemplate } from "../../mails/generic-mails";
import { sendEmail } from "../../utils/mailgun";

export const registerInactiveUsersReminderJob = () => {
  // Runs every day at 6PM
  cron.schedule("0 18 * * *", async () => {
    try {
      console.log("📨 Running inactive users reminder job...");
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      /**
       * USERS WHO:
       * - have not watched videos in 7 days
       * - OR never watched anything
       * - And have not been sent a notification in the last 7 days
       */

      const users = await prismadb.user.findMany({
        where: {
          inactive: false,
          email: {
            not: null,
          },
          AND: [
            {
              OR: [
                {
                  completed_videos: {
                    none: {},
                  },
                },
                {
                  completed_videos: {
                    every: {
                      updatedAt: {
                        lt: sevenDaysAgo,
                      },
                    },
                  },
                },
              ],
            },
            {
              OR: [
                {
                  lastNotificationInActivityDate: null,
                },
                {
                  lastNotificationInActivityDate: {
                    lt: sevenDaysAgo,
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          ongoing_courses: true,
        },
      });

      console.log(`Found ${users.length} inactive users`);

      for (const user of users) {
        if (!user.email) continue;

        try {
          const html = genericEmailTemplate({
            title: "Your learning journey is waiting",
            greeting: `Hi ${user.name || "there"},`,
            message:
              "We noticed you have not been active recently. Other learners are watching lessons, completing quizzes, and building valuable career skills every day.",
            highlightText:
              "Come back today and continue from where you stopped. Even 15 minutes a day can make a huge difference in your growth.",
            buttonText: "Continue Learning",
            buttonUrl: `${process.env.FRONTEND_URL}/dashboard`,
            footerNote:
              "Consistency beats intensity. Keep building your future one lesson at a time.",
          });

          await Promise.all([
            await sendEmail(user.email, "Continue your learning journey", html),
            await prismadb.user.update({
              where: { id: user.id },
              data: { lastNotificationInActivityDate: new Date() },
            }),
          ]);

          console.log(`✅ Reminder sent to ${user.email}`);
        } catch (error) {
          console.error(`❌ Failed sending reminder to ${user.email}`, error);
        }
      }

      console.log("✅ Inactive users reminder job completed");
    } catch (error) {
      console.error("❌ Inactive users reminder cron crashed", error);
    }
  });

  console.log("✅ Inactive users reminder cron registered");
};
