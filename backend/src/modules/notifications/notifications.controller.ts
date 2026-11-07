import { Response } from "express";
import { AuthenticatedRequest } from "../../types/auth";
import { NotificationsService } from "./notifications.service";

export async function getUserNotifications(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;

    const data = await NotificationsService.getUserNotifications(userId, page, limit);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function markAsRead(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const notificationId = req.params.id;

    const updated = await NotificationsService.markAsRead(userId, notificationId);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    if (err.message === "NOTIFICATION_NOT_FOUND") {
      return res.status(404).json({ success: false, error: "Notification not found" });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function markAllAsRead(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    await NotificationsService.markAllAsRead(userId);
    return res.json({ success: true, message: "All notifications marked as read" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getPreferences(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const prefs = await NotificationsService.getPreferences(userId);
    return res.json({ success: true, data: prefs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function updatePreferences(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const updated = await NotificationsService.updatePreferences(userId, req.body);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
