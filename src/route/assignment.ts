import express from "express";
import { 
  getAssignment, 
  getAssignmentSubmission, 
  submitAssignment, 
  getAssignmentSubmissions, 
  gradeSubmission, 
  bulkGradeSubmissions,
  createQuizAssignment,
  getAssignmentQuizResults,
  getAssignmentQuizSubmissions
} from "../controllers/assignment";
import { isLoggedIn, isCourseAdmin } from "../middleware";

export default (router: express.Router) => {
  router.get("/assignments/:assignmentId", isLoggedIn, getAssignment);
  router.get(
    "/assignments/:assignmentId/submission",
    isLoggedIn,
    getAssignmentSubmission
  );
  router.post(
    "/assignments/:assignmentId/submit",
    isLoggedIn,
    submitAssignment
  );
  router.get(
    "/assignments/:assignmentId/submissions",
    isLoggedIn,
    isCourseAdmin,
    getAssignmentSubmissions
  );
  router.post(
    "/assignments/submissions/:submissionId/grade",
    isLoggedIn,
    isCourseAdmin,
    gradeSubmission
  );
  router.post(
    "/assignments/:assignmentId/bulk-grade",
    isLoggedIn,
    isCourseAdmin,
    bulkGradeSubmissions
  );
  
  router.post(
    "/assignments/create-quiz",
    isLoggedIn,
    isCourseAdmin,
    createQuizAssignment
  );
  router.get(
    "/assignments/:assignmentId/quiz-submissions",
    isLoggedIn,
    isCourseAdmin,
    getAssignmentQuizSubmissions
  );
  router.get(
    "/assignments/:assignmentId/quiz-results",
    isLoggedIn,
    getAssignmentQuizResults
  );
};