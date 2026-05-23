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
import { registerCronJobs } from "./cron/index";

const app = express();

// CORS Configuration
const corsOptions = {
  origin: [
    process.env.NEXT_PUBLIC_APP_URL || "",
    process.env.NEXT_ADMIN_APP_URL || "",
    process.env.NEXT_LOCAL_APP_URL || "",
    process.env.NEXT_LOCAL_ADMIN_APP_URL || "",
    process.env.NEXT_TEST_APP_URL || "",
    "http://localhost:3001",
    "http://localhost:3002",
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

server.listen(8002, () => {
  console.log(
    `🚀 Pluto Master Current is active at: ${process.env.BACKEND_URL}`,
  );

  registerCronJobs();
});
