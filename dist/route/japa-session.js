"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const japa_session_1 = require("../controllers/japa-session");
exports.default = (router) => {
    router.post("/japa-session/register", japa_session_1.registerForJapaSession);
};
//# sourceMappingURL=japa-session.js.map