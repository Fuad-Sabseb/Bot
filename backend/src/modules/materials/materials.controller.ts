import { Request, Response } from "express";
import { MaterialsService } from "./materials.service";
import fs from "fs";

export class MaterialsController {
  static async createMaterial(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { courseOfferingId, title, description, category, tags } = req.body;

      if (!courseOfferingId || !title || !category) {
        res.status(400).json({
          success: false,
          error: "Missing required fields: courseOfferingId, title, and category are required.",
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: "No file uploaded. An academic resource file is required.",
        });
        return;
      }

      const material = await MaterialsService.createMaterial(
        userId,
        { courseOfferingId, title, description, category, tags },
        req.file
      );

      res.status(201).json({ success: true, data: material });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else if (err.message.startsWith("COURSE_OFFERING_NOT_FOUND")) {
        res.status(404).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async listMaterials(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const {
        courseOfferingId,
        courseId,
        academicYearId,
        semesterId,
        category,
        search,
        status,
        sortBy,
        page,
        limit,
      } = req.query;

      const data = await MaterialsService.listMaterials(userId, {
        courseOfferingId: courseOfferingId as string,
        courseId: courseId as string,
        academicYearId: academicYearId as string,
        semesterId: semesterId as string,
        category: category as any,
        search: search as string,
        status: status as any,
        sortBy: sortBy as any,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getMaterial(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const materialId = req.params.id;

      const material = await MaterialsService.getMaterialById(materialId, userId);
      res.json({ success: true, data: material });
    } catch (err: any) {
      if (err.message === "MATERIAL_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Learning material not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async updateMaterial(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const materialId = req.params.id;
      const { title, description, category, tags } = req.body;

      const updated = await MaterialsService.updateMaterial(materialId, userId, {
        title,
        description,
        category,
        tags,
      });

      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err.message === "MATERIAL_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Learning material not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async deleteMaterial(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const materialId = req.params.id;
      const purge = req.query.purge === "true";

      const result = await MaterialsService.deleteMaterial(materialId, userId, purge);
      res.json(result);
    } catch (err: any) {
      if (err.message === "MATERIAL_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Learning material not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async downloadMaterial(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const materialId = req.params.id;

      const { filePath, fileName, mimeType } = await MaterialsService.downloadMaterial(
        materialId,
        userId
      );

      res.setHeader("Content-Type", mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileName)}"`
      );

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err: any) {
      if (err.message === "MATERIAL_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Learning material not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async getModerationQueue(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const queue = await MaterialsService.getModerationQueue(userId);
      res.json({ success: true, data: queue });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async moderateMaterial(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const materialId = req.params.id;
      const { status, note } = req.body;

      if (!status || !["APPROVED", "REJECTED", "ARCHIVED"].includes(status)) {
        res.status(400).json({
          success: false,
          error: "Invalid moderation status. Must be APPROVED, REJECTED, or ARCHIVED.",
        });
        return;
      }

      const moderated = await MaterialsService.moderateMaterial(
        materialId,
        userId,
        status,
        note
      );

      res.json({ success: true, data: moderated });
    } catch (err: any) {
      if (err.message === "MATERIAL_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Learning material not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const stats = await MaterialsService.getMaterialStats(userId);
      res.json({ success: true, data: stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
