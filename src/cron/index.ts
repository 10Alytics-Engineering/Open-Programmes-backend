import { registerLiveClassNotificationsJob } from "./jobs/live-class-notifications.job";
import { registerGoogleSheetsSyncJob } from "./jobs/google-sheets-sync.job";
import { registerInactiveUsersReminderJob } from "./jobs/inactive-users-reminder.job";
import { registerInstallmentPaymentReminderJob } from "./jobs/payment-reminder.job";

export const registerCronJobs = () => {
  if (process.env.ENABLE_CRON_JOBS === "false") {
    console.log("⏸️ Cron jobs disabled");
    return;
  }

  registerLiveClassNotificationsJob();
  registerGoogleSheetsSyncJob();
  registerInactiveUsersReminderJob();
  registerInstallmentPaymentReminderJob();

  console.log("✅ All cron jobs registered");
};
