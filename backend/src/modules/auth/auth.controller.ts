import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service";
import { z } from "zod";

const registerSchema = z.object({
  campusId: z.string().min(1, "Campus ID is required"),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email().optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
});

const loginSchema = z.object({
  identifier: z.string().min(1, "Identifier is required"),
  password: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", details: parsed.error.format() },
        });
        return;
      }

      const result = await AuthService.registerStudent({
        ...parsed.data,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });

      // Set refresh token cookie (HttpOnly)
      res.cookie("refreshToken", result.tokens.refreshToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/api/v1/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", details: parsed.error.format() },
        });
        return;
      }

      const result = await AuthService.login({
        ...parsed.data,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });

      res.cookie("refreshToken", result.tokens.refreshToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/api/v1/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async loginTelegramMiniApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { telegramUser } = req.body;
      if (!telegramUser || !telegramUser.id) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "telegramUser with id is required" },
        });
        return;
      }

      const result = await AuthService.loginWithTelegramMiniApp(telegramUser);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Refresh token can arrive via HttpOnly Cookie OR JSON body
      const token = req.cookies?.refreshToken || req.body?.refreshToken;

      if (!token) {
        res.status(400).json({
          success: false,
          error: { code: "MISSING_REFRESH_TOKEN", message: "Refresh token is required" },
        });
        return;
      }

      const tokens = await AuthService.refreshTokens(token);

      res.cookie("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/api/v1/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user && req.sessionId) {
        await AuthService.revokeSession(req.user.userId, req.sessionId);
      }

      res.clearCookie("refreshToken", { path: "/api/v1/auth" });
      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      next(error);
    }
  }

  static async getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { code: "UNAUTHORIZED" } });
        return;
      }
      const sessions = await AuthService.listSessions(req.user.userId);
      res.json({ success: true, data: sessions });
    } catch (error) {
      next(error);
    }
  }

  static async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { code: "UNAUTHORIZED" } });
        return;
      }
      const sessionId = req.params.sessionId;
      const revoked = await AuthService.revokeSession(req.user.userId, sessionId);
      res.json({ success: revoked });
    } catch (error) {
      next(error);
    }
  }
}
