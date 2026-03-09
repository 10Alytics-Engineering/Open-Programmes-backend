"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismadb = void 0;
// Updated index.ts
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const compression_1 = __importDefault(require("compression"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const node_cron_1 = __importDefault(require("node-cron"));
const prismadb_1 = require("./lib/prismadb");
Object.defineProperty(exports, "prismadb", { enumerable: true, get: function () { return prismadb_1.prismadb; } });
const route_1 = __importDefault(require("./route"));
const paystack_1 = __importDefault(require("./controllers/paystack"));
const sales_dashboard_1 = __importDefault(require("./controllers/sales-dashboard"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
dotenv_1.default.config();
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
app.use((0, cors_1.default)(corsOptions));
app.use((0, cookie_parser_1.default)());
app.use((0, compression_1.default)());
app.use(express_1.default.json());
app.use(body_parser_1.default.json());
// Lowest Mb sent at a time
app.use(body_parser_1.default.urlencoded({ limit: "50mb", extended: true }));
app.use('/api', (0, route_1.default)());
app.use('/api', paystack_1.default);
app.use('/api/admin', sales_dashboard_1.default); // Add this line
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
const server = http_1.default.createServer(app);
node_cron_1.default.schedule("0 * * * *", async () => {
    console.log("🔄 Running hourly transaction cleanup...", new Date().toISOString());
});
server.listen(8000, () => {
    console.log("🚀 Pluto Master Current is active at: http://localhost:8000");
});
//# sourceMappingURL=index.js.map