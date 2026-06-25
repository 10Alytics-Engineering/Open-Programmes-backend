import express from "express";
import { isLoggedIn } from "../middleware";
import {
  addToOngoing,
  addToCompleted,
  getCourseLessonAccess,
} from "../controllers/user-course-status";

export default (router: express.Router) => {
  router.patch("/update-ongoing-course", isLoggedIn, addToOngoing);
  router.patch("/update-completed-course", isLoggedIn, addToCompleted);
  router.get(
    "/courses/:courseId/lesson-access",
    isLoggedIn,
    getCourseLessonAccess,
  );
};
