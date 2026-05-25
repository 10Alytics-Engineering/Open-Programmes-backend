"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGoogleSheetsSyncJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const googleSheets_1 = require("../../utils/googleSheets");
const registerGoogleSheetsSyncJob = () => {
    node_cron_1.default.schedule("*/30 * * * *", async () => {
        const startTime = new Date();
        console.log("📊 Starting scheduled Google Sheets Full Sync...", startTime.toISOString());
        try {
            const result = await googleSheets_1.GoogleSheetsSyncService.syncAllApplications();
            const paymentResult = await googleSheets_1.GoogleSheetsSyncService.syncPaymentData();
            const endTime = new Date();
            if (result?.success) {
                console.log(`✅ [CRON_IWD_SYNC]: Synced ${result.count} apps. Took ${endTime.getTime() - startTime.getTime()}ms`);
            }
            else {
                console.error(`❌ [CRON_IWD_SYNC]: ${result?.error || "Unknown error"}`);
            }
            if (paymentResult?.success) {
                console.log(`✅ [CRON_PAYMENTS_SYNC]: Synced ${paymentResult.count} records.`);
            }
            else {
                console.error(`❌ [CRON_PAYMENTS_SYNC]: ${paymentResult?.error || "Unknown error"}`);
            }
        }
        catch (error) {
            console.error("🔥 [CRON_CRITICAL_ERROR]: Sync job crashed!", error.message);
        }
    });
    console.log("✅ Google Sheets sync cron registered");
};
exports.registerGoogleSheetsSyncJob = registerGoogleSheetsSyncJob;
//# sourceMappingURL=google-sheets-sync.job.js.map