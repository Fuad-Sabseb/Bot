import { Router } from "express";
import { AdminController } from "./admin.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireGlobalRole } from "../../middleware/rbac.middleware";

const router = Router();

// All routes in /api/v1/admin require authenticated ADMIN role
router.use(authenticate);
router.use(requireGlobalRole("ADMIN"));

router.get("/analytics", AdminController.getAnalytics);
router.get("/system/health", AdminController.getSystemHealth);
router.get("/audit-logs", AdminController.getAuditLogs);
router.post("/audit-logs", AdminController.createAuditLog);

export default router;
