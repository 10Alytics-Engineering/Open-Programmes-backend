"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerInactiveUsersReminderJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const prismadb_1 = require("../../lib/prismadb");
const generic_mails_1 = require("../../mails/generic-mails");
const mailgun_1 = require("../../utils/mailgun");
const registerInactiveUsersReminderJob = () => {
    // Runs every day at 6PM
    node_cron_1.default.schedule("0 18 * * *", async () => {
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
            const users = await prismadb_1.prismadb.user.findMany({
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
                if (!user.email)
                    continue;
                try {
                    const html = (0, generic_mails_1.genericEmailTemplate)({
                        title: "Your learning journey is waiting",
                        greeting: `Hi ${user.name || "there"},`,
                        message: "We noticed you have not been active recently. Other learners are watching lessons, completing quizzes, and building valuable career skills every day.",
                        highlightText: "Come back today and continue from where you stopped. Even 15 minutes a day can make a huge difference in your growth.",
                        buttonText: "Continue Learning",
                        buttonUrl: `${process.env.FRONTEND_URL}/dashboard`,
                        footerNote: "Consistency beats intensity. Keep building your future one lesson at a time.",
                    });
                    await Promise.all([
                        await (0, mailgun_1.sendEmail)(user.email, "Continue your learning journey", html),
                        await prismadb_1.prismadb.user.update({
                            where: { id: user.id },
                            data: { lastNotificationInActivityDate: new Date() },
                        }),
                    ]);
                    console.log(`✅ Reminder sent to ${user.email}`);
                }
                catch (error) {
                    console.error(`❌ Failed sending reminder to ${user.email}`, error);
                }
            }
            console.log("✅ Inactive users reminder job completed");
        }
        catch (error) {
            console.error("❌ Inactive users reminder cron crashed", error);
        }
    });
    console.log("✅ Inactive users reminder cron registered");
};
exports.registerInactiveUsersReminderJob = registerInactiveUsersReminderJob;
//# sourceMappingURL=inactive-users-reminder.job.js.map