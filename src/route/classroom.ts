import express from "express";
import {
  getClassroomData,
  getClassroomTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  addSubItem,
  getStreamPosts,
  getStreamActivities,
  createStreamPost,
  deleteAssignment,
  deleteMaterial,
  deleteRecording,
  joinLiveClass,
  getLiveClassAttendance,
  getCohortLiveClasses
} from "../controllers/classroom";
import {
  addBatchItem,
  createBatchTopics,
  getTopicsForCohorts,
} from "../controllers/batchClassroom";
import { isLoggedIn, isCourseAdmin } from "../middleware";

export default (router: express.Router) => {
    router.get(
    "/classroom/batch/topics",
    isLoggedIn,
    getTopicsForCohorts
  );
  router.get("/classroom/:cohortId", isLoggedIn, getClassroomData);
  router.get("/classroom/topics", isLoggedIn, getClassroomTopics);
  router.get("/classroom/:cohortId/topics", isLoggedIn, getClassroomTopics);
  router.get("/stream/:cohortId", isLoggedIn, getStreamPosts);
  router.get("/stream/:cohortId/activities", isLoggedIn, getStreamActivities);
  router.post("/stream/:cohortId", isLoggedIn, isCourseAdmin, createStreamPost);
  router.post("/classroom/topics", isLoggedIn, isCourseAdmin, createTopic);
  router.patch(
    "/classroom/topics/:topicId",
    isLoggedIn,
    isCourseAdmin,
    updateTopic
  );
  router.delete(
    "/classroom/topics/:topicId",
    isLoggedIn,
    isCourseAdmin,
    deleteTopic
  );
  router.post("/classroom/items", isLoggedIn, isCourseAdmin, addSubItem);
  router.post("/classroom/live-class/:id/join", isLoggedIn, joinLiveClass);
  router.get("/classroom/live-class/:id/attendance", isLoggedIn, isCourseAdmin, getLiveClassAttendance);
  router.get("/classroom/:cohortId/live-classes", isLoggedIn, isCourseAdmin, getCohortLiveClasses);

  // Batch operations
  router.post(
    "/classroom/batch/items",
    isLoggedIn,
    isCourseAdmin,
    addBatchItem
  );
  router.post(
    "/classroom/batch/topics",
    isLoggedIn,
    isCourseAdmin,
    createBatchTopics
  );
    router.delete(
    "/classroom/assignments/:assignmentId",
    isLoggedIn,
    isCourseAdmin,
    deleteAssignment
  );
  router.delete(
    "/classroom/materials/:materialId",
    isLoggedIn,
    isCourseAdmin,
    deleteMaterial
  );
  router.delete(
    "/classroom/recordings/:recordingId",
    isLoggedIn,
    isCourseAdmin,
    deleteRecording
  );
};
