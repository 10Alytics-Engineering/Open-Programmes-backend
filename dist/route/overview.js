"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const overview_1 = require("../controllers/overview");
exports.default = (router) => {
    router.get("/overview", middleware_1.isCourseAdmin, overview_1.getOverview);
    router.get("/dashboard/student", middleware_1.isLoggedIn, overview_1.getStudentDashboard);
    router.get("/dashboard/student/course-context", middleware_1.isLoggedIn, overview_1.getStudentDashboardCourseContext);
};
//# sourceMappingURL=overview.js.map