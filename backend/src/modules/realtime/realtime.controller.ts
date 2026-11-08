import { Request, Response } from "express";
import { RealtimeService } from "./realtime.service";

export class RealtimeController {
  /**
   * Return client configuration for Neon Realtime
   */
  static getConfig(req: Request, res: Response) {
    const config = RealtimeService.getConfig();
    return res.json({
      success: true,
      data: config,
    });
  }

  /**
   * Seal an announcements query for authenticated live updates
   */
  static async sealAnnouncements(req: Request, res: Response) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const sealed = await RealtimeService.sealAnnouncementsQuery(limit);
      return res.json({
        success: true,
        data: {
          realtimeUrl: process.env.NEON_REALTIME_URL,
          sealed,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: {
          code: "REALTIME_SEAL_ERROR",
          message: err.message,
        },
      });
    }
  }

  /**
   * Seal a custom authorized live query
   */
  static async sealQuery(req: Request, res: Response) {
    try {
      const { sql, params } = req.body;
      if (!sql || typeof sql !== "string") {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing 'sql' query string in request body",
          },
        });
      }

      // Security: enforce read-only statements
      const trimmed = sql.trim().toLowerCase();
      if (!trimmed.startsWith("select") || /insert|update|delete|drop|alter|truncate|create/i.test(trimmed)) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN_QUERY",
            message: "Live queries must be strictly read-only SELECT statements",
          },
        });
      }

      const sealed = await RealtimeService.sealQuery(sql, Array.isArray(params) ? params : []);
      return res.json({
        success: true,
        data: {
          realtimeUrl: process.env.NEON_REALTIME_URL,
          sealed,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: {
          code: "REALTIME_SEAL_ERROR",
          message: err.message,
        },
      });
    }
  }
}
