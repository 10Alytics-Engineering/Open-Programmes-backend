"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const classroom_1 = require("../controllers/classroom");
const batchClassroom_1 = require("../controllers/batchClassroom");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.get("/classroom/batch/topics", middleware_1.isLoggedIn, batchClassroom_1.getTopicsForCohorts);
    router.get("/classroom/:cohortId", middleware_1.isLoggedIn, classroom_1.getClassroomData);
    router.get("/classroom/:cohortId/topics", middleware_1.isLoggedIn, classroom_1.getClassroomTopics);
    router.get("/stream/:cohortId", middleware_1.isLoggedIn, classroom_1.getStreamPosts);
    router.get("/stream/:cohortId/activities", middleware_1.isLoggedIn, classroom_1.getStreamActivities);
    router.post("/stream/:cohortId", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, classroom_1.createStreamPost);
    router.post("/classroom/topics", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, classroom_1.createTopic);
    router.patch("/classroom/topics/:topicId", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, classroom_1.updateTopic);
    router.delete("/classroom/topics/:topicId", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, classroom_1.deleteTopic);
    router.post("/classroom/items", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, classroom_1.addSubItem);
    // Batch operations
    router.post("/classroom/batch/items", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, batchClassroom_1.addBatchItem);
    router.post("/classroom/batch/topics", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, batchClassroom_1.createBatchTopics);
    router.delete("/classroom/assignments/:assignmentId", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, classroom_1.deleteAssignment);
    router.delete("/classroom/materials/:materialId", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, classroom_1.deleteMaterial);
    router.delete("/classroom/recordings/:recordingId", middleware_1.isLoggedIn, middleware_1.isCourseAdmin, classroom_1.deleteRecording);
};
//# sourceMappingURL=classroom.js.map