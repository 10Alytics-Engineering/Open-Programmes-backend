"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const masterclass_1 = require("../controllers/masterclass");
exports.default = (router) => {
    router.post("/masterclass/register", masterclass_1.registerMasterclass);
    router.get("/masterclass/applicants", masterclass_1.getMasterClassApplicants);
};
//# sourceMappingURL=masterclass.js.map