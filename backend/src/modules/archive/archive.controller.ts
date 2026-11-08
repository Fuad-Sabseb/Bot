import { Request, Response } from "express";
import { ArchiveService } from "./archive.service";
import fs from "fs";

export class ArchiveController {
  static async createResource(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const {
        courseOfferingId,
        title,
        description,
        resourceType,
        assessmentType,
        examYear,
        isOfficial,
        academicYearStr,
        semesterNum,
        tags,
      } = req.body;

      if (!courseOfferingId || !title || !resourceType) {
        res.status(400).json({
          success: false,
          error: "Missing required fields: courseOfferingId, title, and resourceType are required.",
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: "No file uploaded. An academic archive file is required.",
        });
        return;
      }

      const resource = await ArchiveService.createResource(
        userId,
        {
          courseOfferingId,
          title,
          description,
          resourceType,
          assessmentType,
          examYear: examYear ? parseInt(examYear, 10) : undefined,
          isOfficial: isOfficial === "true" || isOfficial === true,
          academicYearStr,
          semesterNum: semesterNum ? parseInt(semesterNum, 10) : undefined,
          tags,
        },
        req.file
      );

      res.status(201).json({ success: true, data: resource });
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

  static async listResources(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const {
        courseOfferingId,
        courseId,
        academicYearStr,
        semesterNum,
        examYear,
        resourceType,
        assessmentType,
        isOfficial,
        search,
        status,
        sortBy,
        page,
        limit,
      } = req.query;

      const data = await ArchiveService.listResources(userId, {
        courseOfferingId: courseOfferingId as string,
        courseId: courseId as string,
        academicYearStr: academicYearStr as string,
        semesterNum: semesterNum ? parseInt(semesterNum as string, 10) : undefined,
        examYear: examYear ? parseInt(examYear as string, 10) : undefined,
        resourceType: resourceType as string,
        assessmentType: assessmentType as string,
        isOfficial: isOfficial !== undefined ? String(isOfficial) === "true" : undefined,
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

  static async getResource(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const resourceId = req.params.id;

      const resource = await ArchiveService.getResourceById(resourceId, userId);
      res.json({ success: true, data: resource });
    } catch (err: any) {
      if (err.message === "RESOURCE_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Archived resource not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async updateResource(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const resourceId = req.params.id;
      const { title, description, resourceType, assessmentType, examYear, isOfficial, tags } = req.body;

      const updated = await ArchiveService.updateResource(userId, resourceId, {
        title,
        description,
        resourceType,
        assessmentType,
        examYear: examYear !== undefined ? parseInt(examYear, 10) : undefined,
        isOfficial: isOfficial !== undefined ? String(isOfficial) === "true" : undefined,
        tags,
      });

      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err.message === "RESOURCE_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Archived resource not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async deleteResource(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const resourceId = req.params.id;
      const hardDelete = req.query.hard === "true" || req.body?.hardDelete === true;

      const result = await ArchiveService.deleteResource(userId, resourceId, hardDelete);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === "RESOURCE_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Archived resource not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async downloadResource(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const resourceId = req.params.id;

      const { filePath, fileName, mimeType } = await ArchiveService.prepareDownload(resourceId, userId);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ success: false, error: "Stored file content not found on server disk." });
        return;
      }

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err: any) {
      if (err.message === "RESOURCE_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Archived resource not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async moderateResource(req: Request, res: Response): Promise<void> {
    try {
      const moderatorId = req.user!.userId;
      const resourceId = req.params.id;
      const { action, note, isOfficial } = req.body;

      if (!action || !["APPROVE", "REJECT", "ARCHIVE"].includes(action)) {
        res.status(400).json({
          success: false,
          error: "Invalid moderation action. Must be APPROVE, REJECT, or ARCHIVE.",
        });
        return;
      }

      const updated = await ArchiveService.moderateResource(
        moderatorId,
        resourceId,
        action,
        note,
        isOfficial !== undefined ? isOfficial === "true" || isOfficial === true : undefined
      );

      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err.message === "RESOURCE_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Archived resource not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async getModerationQueue(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const courseOfferingId = req.query.courseOfferingId as string | undefined;

      const queue = await ArchiveService.getModerationQueue(userId, courseOfferingId);
      res.json({ success: true, data: queue });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const courseOfferingId = req.query.courseOfferingId as string | undefined;

      const stats = await ArchiveService.getArchiveStats(userId, courseOfferingId);
      res.json({ success: true, data: stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
