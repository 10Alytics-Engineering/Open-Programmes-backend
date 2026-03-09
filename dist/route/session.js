"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const session_1 = require("../controllers/session");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.post("/sessions", middleware_1.isCourseAdmin, session_1.createSession);
    router.get("/sessions/active", session_1.getActiveSessions);
};
//# sourceMappingURL=session.js.map