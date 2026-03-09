"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const timetable_1 = require("../controllers/timetable");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.post("/timetable", middleware_1.isCourseAdmin, timetable_1.createTimetable);
    router.get("/timetables", middleware_1.isLoggedIn, timetable_1.getTimetables);
    router.get("/timetables/:timetableId", middleware_1.isLoggedIn, timetable_1.getTimetable);
    router.patch("/timetables/:timetableId", middleware_1.isCourseAdmin, timetable_1.updateTimetable);
    router.delete("/timetables/:timetableId", middleware_1.isCourseAdmin, timetable_1.deleteTimetable);
};
//# sourceMappingURL=timetable.js.map