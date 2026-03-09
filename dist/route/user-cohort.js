"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const user_cohort_1 = require("../controllers/user-cohort");
exports.default = (router) => {
    router.patch("/user-cohort/:cohortId", middleware_1.isAdmin, user_cohort_1.updateUserCohort);
};
//# sourceMappingURL=user-cohort.js.map