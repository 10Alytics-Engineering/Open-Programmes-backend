"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const engagement_1 = require("../controllers/engagement");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.get("/engagement/:userId", middleware_1.isAdmin, engagement_1.getStudentEngagement);
    router.get("/engagement/video/:videoId", middleware_1.isAdmin, engagement_1.getVideoEngagementDetails);
    router.get("/engagement/course/:courseId", middleware_1.isAdmin, engagement_1.getCourseEngagementOverview);
    router.get("/engagement/course/:courseId/videos", middleware_1.isAdmin, engagement_1.getCourseVideos);
    router.get("/engagement/:userId/course/:courseId/videos", middleware_1.isCourseAdmin, engagement_1.getUserCourseVideos);
};
//# sourceMappingURL=engagement.js.map