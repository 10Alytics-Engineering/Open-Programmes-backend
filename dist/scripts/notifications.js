"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prismadb_1 = require("../lib/prismadb");
const runSript = async () => {
    const assignments = await prismadb_1.prismadb.courseCohortLeaderboard.findMany({});
    console.log(assignments);
};
runSript().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=notifications.js.map