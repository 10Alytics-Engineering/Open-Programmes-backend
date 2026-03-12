import express from "express";
import { applyForScholarship, getScholarshipApplications, syncScholarshipToSheets, syncPaymentToSheets, publicSyncPaymentToSheets } from "../controllers/scholarship";
import { isCourseAdmin } from "../middleware";

export default (router: express.Router) => {
    router.post("/scholarship/apply", applyForScholarship);
    router.get("/scholarship", isCourseAdmin, getScholarshipApplications);
    router.post("/scholarship/sync", isCourseAdmin, syncScholarshipToSheets);
    router.get("/scholarship/sync", isCourseAdmin, syncScholarshipToSheets);
    router.post("/payment/sync", isCourseAdmin, syncPaymentToSheets);
    router.get("/payment/sync", isCourseAdmin, syncPaymentToSheets);
    router.get("/payment/sync-public", publicSyncPaymentToSheets);
};
