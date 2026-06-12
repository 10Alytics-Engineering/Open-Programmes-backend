import express from "express";
import {
  createFacilitator,
  getFacilitators,
  updateFacilitator,
  deleteFacilitator,
  assignFacilitatorToCourse,
} from "../controllers/facilitator";
import { isSuperAdmin } from "../middleware";

export default (router: express.Router) => {
  router.post("/facilitators", isSuperAdmin, createFacilitator);
  router.get("/facilitators", getFacilitators);
  router.put("/facilitators/:id", isSuperAdmin, updateFacilitator);
  router.delete("/facilitators/:id", isSuperAdmin, deleteFacilitator);
  router.post(
    "/facilitators/:facilitatorId/courses/:courseId",
    isSuperAdmin,
    assignFacilitatorToCourse,
  );
};
