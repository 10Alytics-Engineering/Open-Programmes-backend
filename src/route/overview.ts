import express from "express";
import { isCourseAdmin, isLoggedIn } from "../middleware";
import {
  getOverview,
  getStudentDashboard,
  getStudentDashboardCourseContext,
} from "../controllers/overview";

export default (router: express.Router) => {
  router.get("/overview", isCourseAdmin, getOverview);
  router.get("/dashboard/student", isLoggedIn, getStudentDashboard);
  router.get(
    "/dashboard/student/course-context",
    isLoggedIn,
    getStudentDashboardCourseContext,
  );
};
