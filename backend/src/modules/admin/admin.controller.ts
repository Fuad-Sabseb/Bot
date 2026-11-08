import { Request, Response, NextFunction } from "express";
import { AdminService } from "./admin.service";

export class AdminController {
  static async getAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AdminService.getInstitutionalAnalytics();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getSystemHealth(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AdminService.getSystemHealth();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const action = req.query.action as string | undefined;

      const result = await AdminService.getAuditLogs({ page, limit, action });
      res.json({ success: true, data: result.logs, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }

  static async createAuditLog(req: Request, res: Response, next: NextFunction) {
    try {
      const { targetUserId, action, entity, entityId, details } = req.body;
      const actorUserId = req.user?.userId;
      const ipAddress = req.ip;

      const log = await AdminService.logAction({
        actorUserId,
        targetUserId,
        action,
        entity,
        entityId,
        details,
        ipAddress,
      });

      res.status(201).json({ success: true, data: log });
    } catch (err) {
      next(err);
    }
  }
}
