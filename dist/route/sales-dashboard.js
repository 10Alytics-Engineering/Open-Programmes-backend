"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sales_dashboard_1 = __importDefault(require("../controllers/sales-dashboard"));
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.use("/sales-dashboard", middleware_1.isCourseAdmin, sales_dashboard_1.default);
};
//# sourceMappingURL=sales-dashboard.js.map