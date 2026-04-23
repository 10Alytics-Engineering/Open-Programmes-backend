"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const webinar_1 = require("../controllers/webinar");
exports.default = (router) => {
    router.post("/webinar/ai-automation", webinar_1.registerAiAutomation);
    router.post("/webinar/generative-ai-data", webinar_1.registerGenerativeAiData);
};
//# sourceMappingURL=webinar.js.map