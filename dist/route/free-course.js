"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const free_course_1 = require("../controllers/free-course");
exports.default = (router) => {
    router.post("/free-course/apply", free_course_1.applyForCourse);
    router.get("/free-course/applicants", free_course_1.getFreeCourseApplicants);
    router.get('/export-pdf', free_course_1.exportFreeCourseApplicantsPDF);
};
//# sourceMappingURL=free-course.js.map