"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const overview_1 = require("../controllers/overview");
exports.default = (router) => {
    router.get("/overview", middleware_1.isCourseAdmin, overview_1.getOverview);
};
//# sourceMappingURL=overview.js.map