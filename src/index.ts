import express from "express";
import http from "http";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables immediately after dotsenv import
dotenv.config();

import cron from "node-cron";
import { prismadb } from "./lib/prismadb";
export { prismadb };

import router from "./route";
import paymentApp from "./controllers/payment";
import salesDashboardApp from "./controllers/sales-dashboard";
import path from "path";

const app = express();

// CORS Configuration
const corsOptions = {
  origin: [
    process.env.NEXT_PUBLIC_APP_URL || "",
    process.env.NEXT_ADMIN_APP_URL || "",
    process.env.NEXT_LOCAL_APP_URL || "",
    process.env.NEXT_LOCAL_ADMIN_APP_URL || "",
    process.env.NEXT_TEST_APP_URL || "",
    "https://paystack.com",
  ].filter(Boolean),
};
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(compression());
app.use(express.json());
app.use(bodyParser.json());
// Lowest Mb sent at a time
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

app.use("/api", router());
app.use("/api", paymentApp);
app.use("/api/admin", salesDashboardApp); // Add this line
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use(express.static(path.join(process.cwd(), "public")));

const server = http.createServer(app);


// Live Class Notifications Task (Every minute)
cron.schedule("* * * * *", async () => {
  const { notifyCohortMembers } = await import("./utils/liveClassNotifications");
  const now = new Date();
  const in30Mins = new Date(now.getTime() + 30 * 60 * 1000);

  try {
    // 1. 30 Minutes Reminder
    const soonClasses = await prismadb.liveClass.findMany({
      where: {
        startTime: { lte: in30Mins, gte: now },
        notified30m: false,
      }
    });

    for (const lc of soonClasses) {
      await notifyCohortMembers(lc.id, 'reminder');
    }

    // 2. Class Started Notification
    const startingClasses = await prismadb.liveClass.findMany({
      where: {
        startTime: { lte: now },
        endTime: { gte: now },
        notifiedStart: false,
      }
    });

    for (const lc of startingClasses) {
      await notifyCohortMembers(lc.id, 'started');
    }
  } catch (err) {
    console.error("Cron Live Class Notify Error:", err);
  }
});

// Run Google Sheets Full Sync every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  const startTime = new Date();
  console.log(
    "📊 Starting scheduled Google Sheets Full Sync...",
    startTime.toISOString(),
  );
  try {
    const { GoogleSheetsSyncService } = await import("./utils/googleSheets");
    const result = await GoogleSheetsSyncService.syncAllApplications();
    const paymentResult = await GoogleSheetsSyncService.syncPaymentData();
    const endTime = new Date();

    if (result && result.success) {
      console.log(
        `✅ [CRON_IWD_SYNC]: Synced ${result.count} apps. Took ${endTime.getTime() - startTime.getTime()}ms`,
      );
    } else {
      console.error(`❌ [CRON_IWD_SYNC]: ${result?.error || "Unknown error"}`);
    }

    if (paymentResult && paymentResult.success) {
      console.log(
        `✅ [CRON_PAYMENTS_SYNC]: Synced ${paymentResult.count} records.`,
      );
    } else {
      console.error(
        `❌ [CRON_PAYMENTS_SYNC]: ${paymentResult?.error || "Unknown error"}`,
      );
    }
  } catch (err: any) {
    console.error("🔥 [CRON_CRITICAL_ERROR]: Sync job crashed!", err.message);
  }
});

server.listen(8002, () => {
  console.log(
    `🚀 Pluto Master Current is active at: ${process.env.BACKEND_URL}`,
  );
});
