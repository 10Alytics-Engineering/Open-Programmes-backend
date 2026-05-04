"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const liveClass_1 = require("../controllers/classroom/liveClass");
const classroom_1 = require("../controllers/classroom");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    // Public-ish endpoint for recording attendance (e.g. from unique email link)
    router.post("/live-class/attendance", liveClass_1.recordAttendance);
    // Authenticated endpoints
    router.get("/live-class/active", middleware_1.isLoggedIn, liveClass_1.getLiveClassesForUser);
    router.get("/live-class/:liveClassId", middleware_1.isLoggedIn, liveClass_1.getLiveClassDetails);
    router.delete("/live-class/:liveClassId", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, classroom_1.deleteLiveClass);
};
//# sourceMappingURL=live-class.js.map