"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assignment_1 = require("../controllers/assignment");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.get("/assignments/:assignmentId", middleware_1.isLoggedIn, assignment_1.getAssignment);
    router.get("/assignments/:assignmentId/submission", middleware_1.isLoggedIn, assignment_1.getAssignmentSubmission);
    router.post("/assignments/:assignmentId/submit", middleware_1.isLoggedIn, assignment_1.submitAssignment);
    router.get("/assignments/:assignmentId/submissions", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, assignment_1.getAssignmentSubmissions);
    router.post("/assignments/submissions/:submissionId/grade", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, assignment_1.gradeSubmission);
    router.post("/assignments/:assignmentId/bulk-grade", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, assignment_1.bulkGradeSubmissions);
    router.post("/assignments/create-quiz", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, assignment_1.createQuizAssignment);
    router.get("/assignments/:assignmentId/quiz-results", middleware_1.isLoggedIn, assignment_1.getAssignmentQuizResults);
};
//# sourceMappingURL=assignment.js.map