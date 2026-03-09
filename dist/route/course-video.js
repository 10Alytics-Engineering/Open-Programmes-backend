"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const course_video_1 = require("../controllers/course-video");
exports.default = (router) => {
    router.get("/courses/:courseId/weeks/:weekId/modules/:moduleId/videos", course_video_1.getCourseVideos);
    router.get("/courses/:courseId/weeks/:weekId/modules/:moduleId/videos/:videoId", course_video_1.getCourseVideo);
    router.get("/course-videos/:courseId", course_video_1.getCourseVideosByCourseId);
    router.post("/courses/:courseId/weeks/:weekId/modules/:moduleId/videos", middleware_1.isCourseAdmin, course_video_1.createCourseVideo);
    router.patch("/courses/:courseId/weeks/:weekId/modules/:moduleId/videos/:videoId", middleware_1.isCourseAdmin, course_video_1.updateCourseVideo);
    router.delete("/courses/:courseId/weeks/:weekId/modules/:moduleId/videos/:videoId", middleware_1.isCourseAdmin, course_video_1.deleteCourseVideo);
};
//# sourceMappingURL=course-video.js.map