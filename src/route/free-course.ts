import {
  applyForCourse,
  exportFreeCourseApplicantsPDF,
  getFreeCourseApplicants,
  registerForFreeCourseAccessFromMarketing,
} from "../controllers/free-course";
import express from "express";

export default (router: express.Router) => {
  router.post("/free-course/apply", applyForCourse);
  router.get("/free-course/applicants", getFreeCourseApplicants);
  router.get("/export-pdf", exportFreeCourseApplicantsPDF);
  router.post(
    "/free-course/register",
    registerForFreeCourseAccessFromMarketing,
  );
};
