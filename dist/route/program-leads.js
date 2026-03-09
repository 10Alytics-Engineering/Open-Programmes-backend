"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const program_leads_1 = require("../controllers/program-leads");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.post("/program-leads", program_leads_1.createProgramLead);
    router.get("/program-leads", middleware_1.isCourseAdmin, program_leads_1.getProgramLeads);
    router.get("/program-leads/count", middleware_1.isCourseAdmin, program_leads_1.getProgramLeadsCount);
    router.get("/program-leads/export", middleware_1.isCourseAdmin, program_leads_1.exportProgramLeads);
};
//# sourceMappingURL=program-leads.js.map