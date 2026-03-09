"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("../controllers/events");
exports.default = (router) => {
    router.get("/users/:userId/courses/:courseId/current-week", events_1.getCurrentWeek);
};
//# sourceMappingURL=events.js.map