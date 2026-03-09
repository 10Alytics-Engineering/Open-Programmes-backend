"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const user_course_status_1 = require("../controllers/user-course-status");
exports.default = (router) => {
    router.patch("/update-ongoing-course", middleware_1.isLoggedIn, user_course_status_1.addToOngoing);
    router.patch("/update-completed-course", middleware_1.isLoggedIn, user_course_status_1.addToCompleted);
};
//# sourceMappingURL=user-course-status.js.map