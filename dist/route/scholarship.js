"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scholarship_1 = require("../controllers/scholarship");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.post("/scholarship/apply", scholarship_1.applyForScholarship);
    router.get("/scholarship", middleware_1.isCourseAdmin, scholarship_1.getScholarshipApplications);
    router.post("/scholarship/sync", middleware_1.isCourseAdmin, scholarship_1.syncScholarshipToSheets);
};
//# sourceMappingURL=scholarship.js.map