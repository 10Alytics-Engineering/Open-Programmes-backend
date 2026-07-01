import express from "express";
import salesDashboardApp from "../controllers/sales-dashboard";
import { isSuperAdmin } from "../middleware";

export default (router: express.Router) => {
  router.use("/sales-dashboard", isSuperAdmin, salesDashboardApp);
};
