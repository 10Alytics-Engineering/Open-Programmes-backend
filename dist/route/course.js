"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const course_1 = require("../controllers/course");
exports.default = (router) => {
    router.get("/courses", course_1.getCourses);
    router.get("/courses/:courseId", middleware_1.isLoggedIn, course_1.getCourse);
    router.post("/courses", middleware_1.isCourseAdmin, course_1.createCourse);
    router.patch("/courses/:courseId", middleware_1.isCourseAdmin, course_1.updateCourse);
    router.delete("/courses/:courseId", middleware_1.isAdmin, course_1.deleteCourse);
    router.get("/courses/:courseId/no-auth", course_1.getCourseWithoutAuth);
    router.get("/courses/slug/:slug", course_1.getCourseWithoutAuthWithSlug);
    router.get("/courses/:courseId/cohorts", middleware_1.isLoggedIn, course_1.getCourseCohorts);
};
//# sourceMappingURL=course.js.map