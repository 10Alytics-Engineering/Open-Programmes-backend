import express from "express";
import { isCourseAdmin } from "../middleware";
import {
  createModule,
  deleteModule,
  getModule,
  getModules,
  updateModule,
  updateModuleFreeStatus,
} from "../controllers/course-module";

export default (router: express.Router) => {
  router.get("/courses/:courseId/weeks/:weekId/modules", getModules);
  router.get("/courses/:courseId/weeks/:weekId/modules/:moduleId", getModule);
  router.post(
    "/courses/:courseId/weeks/:weekId/modules",
    isCourseAdmin,
    createModule,
  );
  router.patch(
    "/courses/:courseId/weeks/:weekId/modules/:moduleId",
    isCourseAdmin,
    updateModule,
  );

  router.patch(
    "/courses/:courseId/weeks/:weekId/modules/:moduleId/free-status",
    isCourseAdmin,
    updateModuleFreeStatus,
  );

  router.delete(
    "/courses/:courseId/weeks/:weekId/modules/:moduleId",
    isCourseAdmin,
    deleteModule,
  );
};
