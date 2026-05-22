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
import { isAdmin, isAuthorized } from "../middleware/index";

export default (router: express.Router) => {
  router.get("/users", getUsers);
  router.get("/users/search", searchUsers);
  router.get("/users/:userId", isAuthorized, getUser);
  router.get("/users/get-by-email/:email", getUserByEmail);

  router.get("/users/:userId/no-auth", getUserWithoutAuth);
  router.get("/users/:userId/courses/:courseId/progress", getUserCourseProgress);
  router.post("/users/:userId/add-course", isAdmin, addUserCourse);
  router.post("/users/:userId/switch-course", isAdmin, switchUserCourse);
  router.post("/users/:userId/switch-cohort", isAdmin, switchUserCohort);
  router.patch("/users/:userId/update-cohort", isAdmin, updateUserCohort);
  router.patch("/users/:userId", isAuthorized, updateUser);
  router.patch("/users/:userId/update-image", isAuthorized, updateUserImage);
  router.patch("/users/:userId/update-role", updateUserRole);
  router.delete("/users/:userId", isAuthorized, deleteUser);
  router.delete("/users/:userId/remove-course", isAdmin, removeUserCourse);
};
