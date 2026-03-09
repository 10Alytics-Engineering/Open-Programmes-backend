"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const facilitator_1 = require("../controllers/facilitator");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.post("/facilitators", facilitator_1.createFacilitator);
    router.get("/facilitators", facilitator_1.getFacilitators);
    router.put("/facilitators/:id", middleware_1.isCourseAdmin, facilitator_1.updateFacilitator);
    router.delete("/facilitators/:id", middleware_1.isCourseAdmin, facilitator_1.deleteFacilitator);
    router.post("/facilitators/:facilitatorId/courses/:courseId", middleware_1.isCourseAdmin, facilitator_1.assignFacilitatorToCourse);
};
//# sourceMappingURL=facilitator.js.map