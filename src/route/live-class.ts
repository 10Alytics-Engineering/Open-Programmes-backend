import express from "express";
import {
  recordAttendance,
  getLiveClassesForUser,
  getLiveClassDetails
} from "../controllers/classroom/liveClass";
import { deleteLiveClass } from "../controllers/classroom";
import { isLoggedIn, isCourseAdmin } from "../middleware";

export default (router: express.Router) => {
  // Public-ish endpoint for recording attendance (e.g. from unique email link)
  router.post("/live-class/attendance", recordAttendance);
  
  // Authenticated endpoints
  router.get("/live-class/active", isLoggedIn, getLiveClassesForUser);
  router.get("/live-class/:liveClassId", getLiveClassDetails);
  
  router.delete(
    "/live-class/:liveClassId",
    isLoggedIn,
    isCourseAdmin,
    deleteLiveClass
  );
};
