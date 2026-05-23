import cron from "node-cron";
import { GoogleSheetsSyncService } from "../../utils/googleSheets";

export const registerGoogleSheetsSyncJob = () => {
  cron.schedule("*/30 * * * *", async () => {
    const startTime = new Date();

    console.log(
      "📊 Starting scheduled Google Sheets Full Sync...",
      startTime.toISOString(),
    );

    try {
      const result = await GoogleSheetsSyncService.syncAllApplications();
      const paymentResult = await GoogleSheetsSyncService.syncPaymentData();
      const endTime = new Date();

      if (result?.success) {
        console.log(
          `✅ [CRON_IWD_SYNC]: Synced ${result.count} apps. Took ${
            endTime.getTime() - startTime.getTime()
          }ms`,
        );
      } else {
        console.error(
          `❌ [CRON_IWD_SYNC]: ${result?.error || "Unknown error"}`,
        );
      }

      if (paymentResult?.success) {
        console.log(
          `✅ [CRON_PAYMENTS_SYNC]: Synced ${paymentResult.count} records.`,
        );
      } else {
        console.error(
          `❌ [CRON_PAYMENTS_SYNC]: ${paymentResult?.error || "Unknown error"}`,
        );
      }
    } catch (error: any) {
      console.error(
        "🔥 [CRON_CRITICAL_ERROR]: Sync job crashed!",
        error.message,
      );
    }
  });

  console.log("✅ Google Sheets sync cron registered");
};
