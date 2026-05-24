"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLiveClassNotificationsJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const prismadb_1 = require("../../lib/prismadb");
const liveClassNotifications_1 = require("../../utils/liveClassNotifications");
const registerLiveClassNotificationsJob = () => {
    node_cron_1.default.schedule("* * * * *", async () => {
        const now = new Date();
        const in30Mins = new Date(now.getTime() + 30 * 60 * 1000);
        try {
            const soonClasses = await prismadb_1.prismadb.liveClass.findMany({
                where: {
                    startTime: { lte: in30Mins, gte: now },
                    notified30m: false,
                },
            });
            for (const liveClass of soonClasses) {
                await (0, liveClassNotifications_1.notifyCohortMembers)(liveClass.id, "reminder");
            }
            const startingClasses = await prismadb_1.prismadb.liveClass.findMany({
                where: {
                    startTime: { lte: now },
                    endTime: { gte: now },
                    notifiedStart: false,
                },
            });
            for (const liveClass of startingClasses) {
                await (0, liveClassNotifications_1.notifyCohortMembers)(liveClass.id, "started");
            }
        }
        catch (error) {
            console.error("Cron Live Class Notify Error:", error);
        }
    });
    console.log("✅ Live class notifications cron registered");
};
exports.registerLiveClassNotificationsJob = registerLiveClassNotificationsJob;
//# sourceMappingURL=live-class-notifications.job.js.map