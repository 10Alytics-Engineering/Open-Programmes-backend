"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismadb = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const compression_1 = __importDefault(require("compression"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables immediately after dotsenv import
dotenv_1.default.config();
const node_cron_1 = __importDefault(require("node-cron"));
const prismadb_1 = require("./lib/prismadb");
Object.defineProperty(exports, "prismadb", { enumerable: true, get: function () { return prismadb_1.prismadb; } });
const route_1 = __importDefault(require("./route"));
const payment_1 = __importDefault(require("./controllers/payment"));
const sales_dashboard_1 = __importDefault(require("./controllers/sales-dashboard"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
// CORS Configuration
const corsOptions = {
    origin: [
        process.env.NEXT_PUBLIC_APP_URL || "",
        process.env.NEXT_ADMIN_APP_URL || "",
        process.env.NEXT_LOCAL_APP_URL || "",
        process.env.NEXT_LOCAL_ADMIN_APP_URL || "",
        process.env.NEXT_TEST_APP_URL || "",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "https://paystack.com",
    ].filter(Boolean),
};
app.use((0, cors_1.default)(corsOptions));
app.use((0, cookie_parser_1.default)());
app.use((0, compression_1.default)());
app.use(express_1.default.json());
app.use(body_parser_1.default.json());
// Lowest Mb sent at a time
app.use(body_parser_1.default.urlencoded({ limit: "50mb", extended: true }));
app.use("/api", (0, route_1.default)());
app.use("/api", payment_1.default);
app.use("/api/admin", sales_dashboard_1.default); // Add this line
app.use("/uploads", express_1.default.static(path_1.default.join(process.cwd(), "uploads")));
app.use(express_1.default.static(path_1.default.join(process.cwd(), "public")));
const server = http_1.default.createServer(app);
node_cron_1.default.schedule("0 * * * *", async () => {
    console.log("🔄 Running hourly transaction cleanup...", new Date().toISOString());
});
// Run Google Sheets Full Sync every 30 minutes
node_cron_1.default.schedule("*/30 * * * *", async () => {
    const startTime = new Date();
    console.log("📊 Starting scheduled Google Sheets Full Sync...", startTime.toISOString());
    try {
        const { GoogleSheetsSyncService } = await Promise.resolve().then(() => __importStar(require("./utils/googleSheets")));
        const result = await GoogleSheetsSyncService.syncAllApplications();
        const paymentResult = await GoogleSheetsSyncService.syncPaymentData();
        const endTime = new Date();
        if (result && result.success) {
            console.log(`✅ [CRON_IWD_SYNC]: Synced ${result.count} apps. Took ${endTime.getTime() - startTime.getTime()}ms`);
        }
        else {
            console.error(`❌ [CRON_IWD_SYNC]: ${result?.error || "Unknown error"}`);
        }
        if (paymentResult && paymentResult.success) {
            console.log(`✅ [CRON_PAYMENTS_SYNC]: Synced ${paymentResult.count} records.`);
        }
        else {
            console.error(`❌ [CRON_PAYMENTS_SYNC]: ${paymentResult?.error || "Unknown error"}`);
        }
    }
    catch (err) {
        console.error("🔥 [CRON_CRITICAL_ERROR]: Sync job crashed!", err.message);
    }
});
server.listen(8002, () => {
    console.log(`🚀 Pluto Master Current is active at: ${process.env.BACKEND_URL}`);
});
//# sourceMappingURL=index.js.map