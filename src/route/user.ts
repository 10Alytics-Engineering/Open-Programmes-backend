import express from "express";
import {
  getUsers,
  searchUsers,
  getUser,
  updateUser,
  updateUserImage,
  deleteUser,
  updateUserRole,
  getUserWithoutAuth,
  getUserByEmail,
  addUserCourse,
  removeUserCourse,
  updateUserCohort,
  getUserCourseProgress,
  switchUserCourse,
  switchUserCohort,
} from "../controllers/user";
import { isAdmin, isAuthorized, isCourseAdmin } from "../middleware/index";

export default (router: express.Router) => {
  router.get("/users", getUsers);
  router.get("/users/search", searchUsers);
  router.get("/users/:userId", isAuthorized, getUser);
  router.get("/users/get-by-email/:email", getUserByEmail);

  router.get("/users/:userId/no-auth", getUserWithoutAuth);
  router.get("/users/:userId/courses/:courseId/progress", getUserCourseProgress);
  router.post("/users/:userId/add-course", isCourseAdmin, addUserCourse);
  router.post("/users/:userId/switch-course", isCourseAdmin, switchUserCourse);
  router.post("/users/:userId/switch-cohort", isCourseAdmin, switchUserCohort);
  router.patch("/users/:userId/update-cohort", isCourseAdmin, updateUserCohort);
  router.patch("/users/:userId", isAuthorized, updateUser);
  router.patch("/users/:userId/update-image", isAuthorized, updateUserImage);
  router.patch("/users/:userId/update-role", updateUserRole);
  router.delete("/users/:userId", isAuthorized, deleteUser);
  router.delete("/users/:userId/remove-course", isCourseAdmin, removeUserCourse);
};
