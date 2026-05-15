import express from "express";
import { isLoggedIn } from "../middleware";
import {
  updateCourseVideoProgress,
  submitQuizAnswer,
  getCourseProgress,
  getUserCourseProgress,
} from "../controllers/user-progress";

export default (router: express.Router) => {
  router.post(
    "/courses/:courseId/update-video-progress",
    isLoggedIn,
    updateCourseVideoProgress,
  );

  router.post("/quizzes/submit-answer", isLoggedIn, submitQuizAnswer);

  router.get("/courses/:courseId/progress", isLoggedIn, getCourseProgress);

  router.get(
    "/courses/:courseId/user-progress",
    isLoggedIn,
    getUserCourseProgress,
  );
};
