"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const course_week_1 = require("../controllers/course-week");
exports.default = (router) => {
    router.get("/courses/:courseId/weeks", course_week_1.getCourseWeeks);
    router.get("/courses/:courseId/weeks/:weekId", course_week_1.getCourseWeek);
    router.post("/courses/:courseId/weeks/", middleware_1.isCourseAdmin, course_week_1.createCourseWeek);
    router.patch("/courses/:courseId/weeks/:weekId", middleware_1.isCourseAdmin, course_week_1.updateCourseWeek);
    router.delete("/courses/:courseId/weeks/:weekId", middleware_1.isAdmin, course_week_1.deleteCourseWeek);
    router.patch("/courses/:courseId/weeks/:weekId/publish", middleware_1.isCourseAdmin, course_week_1.publishCourseWeek);
    router.patch("/courses/:courseId/weeks/:weekId/unPublish", middleware_1.isCourseAdmin, course_week_1.unPublishCourseWeek);
};
//# sourceMappingURL=course-week.js.map