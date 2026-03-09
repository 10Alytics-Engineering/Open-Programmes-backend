"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const leaderboard_1 = require("../controllers/leaderboard");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.get("/leaderboard-ranking/:cohortId", middleware_1.isLoggedIn, leaderboard_1.getCohortLeaderboard);
};
//# sourceMappingURL=leaderboard.js.map