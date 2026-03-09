"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const user_progress_1 = require("../controllers/user-progress");
exports.default = (router) => {
    router.post("/courses/:courseId/update-video-progress", middleware_1.isLoggedIn, user_progress_1.updateCourseVideoProgress);
    router.post("/quizzes/submit-answer", middleware_1.isLoggedIn, user_progress_1.submitQuizAnswer);
    router.get("/courses/:courseId/progress", middleware_1.isLoggedIn, user_progress_1.getCourseProgress);
};
//# sourceMappingURL=user-progress.js.map