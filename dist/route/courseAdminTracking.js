"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const courseAdminTracking_1 = require("../controllers/courseAdminTracking");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    // Course admin routes
    router.get("/engagement/course-admin/dashboard", middleware_1.isCourseAdmin, courseAdminTracking_1.getCourseAdminDashboard);
    router.get("/engagement/course-admin/:courseId/students", middleware_1.isCourseAdmin, courseAdminTracking_1.getCourseAdminStudents);
    router.get("/engagement/course-admin/:courseId/student/:studentId", middleware_1.isCourseAdmin, courseAdminTracking_1.getCourseAdminStudentEngagement);
};
//# sourceMappingURL=courseAdminTracking.js.map