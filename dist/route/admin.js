"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin_1 = require("../controllers/admin");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.post("/admin/users", middleware_1.isCourseAdmin, admin_1.createUser);
    router.post("/admin/users/bulk", middleware_1.isCourseAdmin, admin_1.createBulkUsers);
    router.put("/admin/community-link", middleware_1.isCourseAdmin, admin_1.communityLinkChange);
};
//# sourceMappingURL=admin.js.map