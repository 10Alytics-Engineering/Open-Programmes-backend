import express from "express";
import { applyForScholarship, getScholarshipApplications, syncScholarshipToSheets } from "../controllers/scholarship";
import { isCourseAdmin } from "../middleware";

export default (router: express.Router) => {
    router.post("/scholarship/apply", applyForScholarship);
    router.get("/scholarship", isCourseAdmin, getScholarshipApplications);
    router.post("/scholarship/sync", isCourseAdmin, syncScholarshipToSheets);
};
