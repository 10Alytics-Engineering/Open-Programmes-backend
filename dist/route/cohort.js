"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cohort_1 = require("../controllers/cohort");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.get("/cohorts", cohort_1.getCohorts);
    router.get("/cohorts/change-requests", cohort_1.getCohortsForChangeRequests);
    router.get("/cohorts/:cohortId", middleware_1.isLoggedIn, cohort_1.getCohort);
    router.post("/cohorts", middleware_1.isCourseAdmin, cohort_1.createCohort);
    router.patch("/cohorts/:cohortId", middleware_1.isCourseAdmin, cohort_1.updateCohort);
    router.delete("/cohorts/:cohortId", middleware_1.isCourseAdmin, cohort_1.deleteCohort);
    router.patch("/cohorts/:cohortId/update-cohort-course-week", middleware_1.isCourseAdmin, cohort_1.updateCohortCourseWeekPublishStatus);
    router.patch("/cohorts/:cohortId/update-cohort-course-timetable", middleware_1.isCourseAdmin, cohort_1.updateCohortCourseTimeTable);
    router.post("/cohorts/:cohortId/brochure", cohort_1.upload.single("brochure"), cohort_1.uploadOnboardingBrochure);
};
//# sourceMappingURL=cohort.js.map