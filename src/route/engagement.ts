import express from "express";
import {
  getStudentEngagement,
  getVideoEngagementDetails,
  getCourseEngagementOverview,
  getCourseVideos,
  getUserCourseVideos
} from "../controllers/engagement";
import { isCourseAdmin, isAdmin,  } from "../middleware";

export default (router: express.Router) => {
  router.get("/engagement/:userId", isCourseAdmin, getStudentEngagement);
  router.get("/engagement/video/:videoId", isCourseAdmin, getVideoEngagementDetails);
  router.get(
    "/engagement/course/:courseId",
    isCourseAdmin,
    getCourseEngagementOverview
  );
  router.get("/engagement/course/:courseId/videos", isCourseAdmin, getCourseVideos);
  router.get("/engagement/:userId/course/:courseId/videos", isCourseAdmin, getUserCourseVideos);
};
