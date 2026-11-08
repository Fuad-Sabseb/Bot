import { Router } from "express";
import { DashboardController } from "./dashboard.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.get("/overview", authenticate, DashboardController.getOverview);

export default router;
