import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
} from "./notifications.controller";

const router = Router();

router.use(authenticate);

router.get("/", getUserNotifications);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markAsRead);

router.get("/preferences", getPreferences);
router.patch("/preferences", updatePreferences);

export default router;
