import express from "express";
import {
  createProgramLead,
  getProgramLeads,
  getProgramLeadsCount,
  exportProgramLeads,
} from "../controllers/program-leads";
import { isAdmin } from "../middleware";

export default (router: express.Router) => {
  router.post("/program-leads", createProgramLead);
  router.get("/program-leads", isAdmin, getProgramLeads);
  router.get("/program-leads/count", isAdmin, getProgramLeadsCount);
  router.get("/program-leads/export", isAdmin, exportProgramLeads);
};
