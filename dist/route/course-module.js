"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const course_module_1 = require("../controllers/course-module");
exports.default = (router) => {
    router.get("/courses/:courseId/weeks/:weekId/modules", course_module_1.getModules);
    router.get("/courses/:courseId/weeks/:weekId/modules/:moduleId", course_module_1.getModule);
    router.post("/courses/:courseId/weeks/:weekId/modules", middleware_1.isCourseAdmin, course_module_1.createModule);
    router.patch("/courses/:courseId/weeks/:weekId/modules/:moduleId", middleware_1.isCourseAdmin, course_module_1.updateModule);
    router.delete("/courses/:courseId/weeks/:weekId/modules/:moduleId", middleware_1.isCourseAdmin, course_module_1.deleteModule);
};
//# sourceMappingURL=course-module.js.map