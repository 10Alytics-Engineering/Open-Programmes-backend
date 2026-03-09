"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const quiz_answer_1 = require("../controllers/quiz-answer");
exports.default = (router) => {
    router.post("/quiz/submit-answer", middleware_1.isLoggedIn, quiz_answer_1.submitAnswer);
    router.delete("/quiz/:quizId/quiz-answer/:quizAnswerId", middleware_1.isCourseAdmin, quiz_answer_1.submitAnswer);
};
//# sourceMappingURL=quiz-answer.js.map