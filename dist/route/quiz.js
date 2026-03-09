"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const quiz_1 = require("../controllers/quiz");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    // Quiz CRUD operations
    router.post("/quiz", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, quiz_1.createQuiz);
    router.patch("/quiz/:quizId", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, quiz_1.updateQuiz);
    router.delete("/quiz/:quizId", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, quiz_1.deleteQuiz);
    // Quiz access
    router.get("/quiz/:quizId", middleware_1.isLoggedIn, quiz_1.getQuiz);
    router.get("/quiz", middleware_1.isLoggedIn, quiz_1.getQuizzes);
    router.get("/quiz/week/:weekId", middleware_1.isLoggedIn, quiz_1.getQuizzesByWeek);
    // Quiz submission
    router.post("/quiz/submit", middleware_1.isLoggedIn, quiz_1.submitQuizAnswer);
    router.get("/quiz/answers/user", middleware_1.isLoggedIn, quiz_1.getUserQuizAnswers);
};
//# sourceMappingURL=quiz.js.map