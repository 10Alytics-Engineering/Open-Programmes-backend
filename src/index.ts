// Updated index.ts
import express from "express";
import http from "http";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import { prismadb } from "./lib/prismadb";
export { prismadb };

import router from "./route";
import paymentApp from "./controllers/paystack";
import salesDashboardApp from "./controllers/sales-dashboard";
import path from "path";

const app = express();

dotenv.config();

// CORS Configuration
const corsOptions = {
  origin: [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_ADMIN_APP_URL,
    process.env.NEXT_LOCAL_APP_URL,
    process.env.NEXT_LOCAL_ADMIN_APP_URL,
    process.env.NEXT_TEST_APP_URL,
    "https://paystack.com",
  ],
};
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(compression());
app.use(express.json());
app.use(bodyParser.json());
// Lowest Mb sent at a time
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

app.use('/api', router());
app.use('/api', paymentApp);
app.use('/api/admin', salesDashboardApp); // Add this line
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../public')));

const server = http.createServer(app);

cron.schedule("0 * * * *", async () => {
  console.log("🔄 Running hourly transaction cleanup...", new Date().toISOString());
});

server.listen(8000, () => {
  console.log("🚀 Pluto Master Current is active at: http://localhost:8000");
});