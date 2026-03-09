"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const account_status_1 = require("../controllers/account-status");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    // GET /api/account-status/:userId/status - Get user account status
    router.get("/account-status/:userId/status", middleware_1.isCourseAdmin, account_status_1.getUserAccountStatus);
    // PATCH /api/account-status/:userId/toggle-status - Toggle user account status (suspend/activate)
    router.patch("/account-status/:userId/toggle-status", middleware_1.isCourseAdmin, account_status_1.toggleUserAccountStatus);
};
//# sourceMappingURL=account-status.js.map