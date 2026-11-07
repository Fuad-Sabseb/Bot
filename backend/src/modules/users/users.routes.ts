import { Router } from "express";
import { UsersController } from "./users.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireGlobalRole } from "../../middleware/rbac.middleware";

const router = Router();

// Student / Self Profile Endpoints
router.get("/me", authenticate, UsersController.getProfile);
router.patch("/me", authenticate, UsersController.updateProfile);
router.post("/telegram/link-token", authenticate, UsersController.generateTelegramLink);
router.post("/telegram/link", UsersController.verifyTelegramLink);

// Administrator Management Endpoints
router.get("/", authenticate, requireGlobalRole("ADMIN"), UsersController.adminListUsers);
router.get("/:id", authenticate, requireGlobalRole("ADMIN"), UsersController.adminGetUser);
router.post("/teachers", authenticate, requireGlobalRole("ADMIN"), UsersController.adminProvisionTeacher);
router.patch("/:id/status", authenticate, requireGlobalRole("ADMIN"), UsersController.adminUpdateStatus);
router.post("/:id/roles/global", authenticate, requireGlobalRole("ADMIN"), UsersController.adminManageGlobalRole);
router.post("/:id/roles/class", authenticate, requireGlobalRole("ADMIN"), UsersController.adminManageClassRole);
router.post("/:id/roles/course", authenticate, requireGlobalRole("ADMIN"), UsersController.adminManageCourseRole);

export default router;
