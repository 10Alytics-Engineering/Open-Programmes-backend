import express from "express";
import salesDashboardApp from "../controllers/sales-dashboard";
import { isCourseAdmin } from "../middleware";

export default (router: express.Router) => {
    router.use("/sales-dashboard", isCourseAdmin, salesDashboardApp);
};
