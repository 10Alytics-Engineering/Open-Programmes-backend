"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCronJobs = void 0;
const live_class_notifications_job_1 = require("./jobs/live-class-notifications.job");
const google_sheets_sync_job_1 = require("./jobs/google-sheets-sync.job");
const inactive_users_reminder_job_1 = require("./jobs/inactive-users-reminder.job");
const registerCronJobs = () => {
    if (process.env.ENABLE_CRON_JOBS === "false") {
        console.log("⏸️ Cron jobs disabled");
        return;
    }
    (0, live_class_notifications_job_1.registerLiveClassNotificationsJob)();
    (0, google_sheets_sync_job_1.registerGoogleSheetsSyncJob)();
    (0, inactive_users_reminder_job_1.registerInactiveUsersReminderJob)();
    console.log("✅ All cron jobs registered");
};
exports.registerCronJobs = registerCronJobs;
//# sourceMappingURL=index.js.map