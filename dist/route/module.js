"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const module_1 = require("../controllers/module");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    // Get all modules for a specific week
    router.get("/module/week/:weekId", module_1.getModulesByWeek);
    // Create a new module
    router.post("/module", middleware_1.isCourseAdmin, module_1.createModule);
};
//# sourceMappingURL=module.js.map