import { Request, Response, NextFunction } from "express";
import { UsersService } from "./users.service";
import { z } from "zod";

const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).optional(),
});

const provisionTeacherSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(6).optional(),
});

export class UsersController {
  static async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await UsersService.getProfile(req.user!.userId);
      res.json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  }

  static async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
        return;
      }
      const updated = await UsersService.updateProfile(req.user!.userId, parsed.data);
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  static async generateTelegramLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = UsersService.generateTelegramLinkToken(req.user!.userId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async verifyTelegramLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { otp, telegramChatId, telegramUsername } = req.body;
      if (!otp || !telegramChatId) {
        res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "otp and telegramChatId are required" } });
        return;
      }
      const result = await UsersService.verifyTelegramLinkToken(otp, telegramChatId, telegramUsername);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  static async adminListUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { search, role, classId, isActive, page, limit } = req.query;
      const result = await UsersService.adminListUsers({
        search: search as string,
        role: role as string,
        classId: classId as string,
        isActive: isActive !== undefined ? isActive === "true" : undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async adminGetUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await UsersService.getProfile(req.params.id);
      res.json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  }

  static async adminProvisionTeacher(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = provisionTeacherSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
        return;
      }
      const result = await UsersService.adminProvisionTeacher(parsed.data);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async adminUpdateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") {
        res.status(400).json({ success: false, error: { code: "INVALID_FIELD", message: "isActive boolean is required" } });
        return;
      }
      const user = await UsersService.adminUpdateUserStatus(req.params.id, isActive);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  static async adminManageGlobalRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { role, assign } = req.body;
      if (!role || typeof assign !== "boolean") {
        res.status(400).json({ success: false, error: { code: "INVALID_FIELDS", message: "role and assign boolean required" } });
        return;
      }
      await UsersService.adminManageGlobalRole(req.params.id, role, assign);
      res.json({ success: true, message: `Global role ${role} ${assign ? "assigned" : "removed"}.` });
    } catch (error) {
      next(error);
    }
  }

  static async adminManageClassRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { classId, role, assign } = req.body;
      if (!classId || !role || typeof assign !== "boolean") {
        res.status(400).json({ success: false, error: { code: "INVALID_FIELDS", message: "classId, role, and assign boolean required" } });
        return;
      }
      await UsersService.adminManageClassRole(req.params.id, classId, role, assign);
      res.json({ success: true, message: `Class role ${role} ${assign ? "assigned" : "removed"}.` });
    } catch (error) {
      next(error);
    }
  }

  static async adminManageCourseRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { courseOfferingId, role, assign } = req.body;
      if (!courseOfferingId || !role || typeof assign !== "boolean") {
        res.status(400).json({ success: false, error: { code: "INVALID_FIELDS", message: "courseOfferingId, role, and assign boolean required" } });
        return;
      }
      await UsersService.adminManageCourseRole(req.params.id, courseOfferingId, role, assign);
      res.json({ success: true, message: `Course role ${role} ${assign ? "assigned" : "removed"}.` });
    } catch (error) {
      next(error);
    }
  }
}
