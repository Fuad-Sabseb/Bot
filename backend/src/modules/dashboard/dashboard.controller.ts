import { Request, Response, NextFunction } from "express";
import { DashboardService } from "./dashboard.service";

export class DashboardController {
  static async getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const overview = await DashboardService.getOverview(req.user!);
      res.json({ success: true, data: overview });
    } catch (error) {
      next(error);
    }
  }
}
