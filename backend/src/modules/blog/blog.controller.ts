import { Request, Response } from "express";
import { BlogService } from "./blog.service";
import { StorageService } from "../../services/storage.service";

export class BlogController {
  // ==========================================
  // 1. POST CRUD & DISCOVERY
  // ==========================================

  static async createPost(req: Request, res: Response): Promise<void> {
    try {
      const authorId = req.user!.userId;
      const post = await BlogService.createPost(authorId, req.body);
      res.status(201).json({ success: true, data: post });
    } catch (err: any) {
      if (err.message.startsWith("INVALID_INPUT")) {
        res.status(400).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async listPosts(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { category, tag, search, authorId, myPosts, status, sort, limit, offset } = req.query;

      const result = await BlogService.listPosts(userId, {
        category: category as string,
        tag: tag as string,
        search: search as string,
        authorId: authorId as string,
        myPosts: myPosts === "true",
        status: status as any,
        sort: sort as any,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      res.json({ success: true, data: result.posts, total: result.total });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getPost(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const post = await BlogService.getPostBySlugOrId(req.params.slugOrId, userId);
      res.json({ success: true, data: post });
    } catch (err: any) {
      if (err.message === "POST_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Blog post not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async updatePost(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const updated = await BlogService.updatePost(userId, req.params.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err.message === "POST_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Blog post not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async deletePost(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await BlogService.deletePost(userId, req.params.id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === "POST_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Blog post not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  // ==========================================
  // 2. INTERACTIONS (LIKES, BOOKMARKS, COMMENTS)
  // ==========================================

  static async toggleLike(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await BlogService.toggleLike(userId, req.params.id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === "POST_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Blog post not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async toggleBookmark(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await BlogService.toggleBookmark(userId, req.params.id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === "POST_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Blog post not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async listBookmarks(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const bookmarks = await BlogService.listBookmarks(userId);
      res.json({ success: true, data: bookmarks });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async addComment(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { content } = req.body;
      const comment = await BlogService.addComment(userId, req.params.id, content);
      res.status(201).json({ success: true, data: comment });
    } catch (err: any) {
      if (err.message === "POST_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Blog post not found." });
      } else if (err.message.startsWith("INVALID_INPUT")) {
        res.status(400).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async deleteComment(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await BlogService.deleteComment(userId, req.params.commentId);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === "COMMENT_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Comment not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  // ==========================================
  // 3. AUTHOR PROFILE
  // ==========================================

  static async getAuthorProfile(req: Request, res: Response): Promise<void> {
    try {
      const profile = await BlogService.getAuthorProfile(req.params.authorId);
      res.json({ success: true, data: profile });
    } catch (err: any) {
      if (err.message === "AUTHOR_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Author not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  // ==========================================
  // 4. REPORTING & MODERATION
  // ==========================================

  static async reportPost(req: Request, res: Response): Promise<void> {
    try {
      const reporterId = req.user!.userId;
      const { reason, details } = req.body;
      const report = await BlogService.reportPost(reporterId, req.params.id, reason, details);
      res.status(201).json({ success: true, data: report });
    } catch (err: any) {
      if (err.message === "POST_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Blog post not found." });
      } else if (err.message.startsWith("ALREADY_REPORTED")) {
        res.status(409).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async reportComment(req: Request, res: Response): Promise<void> {
    try {
      const reporterId = req.user!.userId;
      const { reason, details } = req.body;
      const report = await BlogService.reportComment(reporterId, req.params.commentId, reason, details);
      res.status(201).json({ success: true, data: report });
    } catch (err: any) {
      if (err.message === "COMMENT_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Comment not found." });
      } else if (err.message.startsWith("ALREADY_REPORTED")) {
        res.status(409).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async listReports(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user!.userId;
      const status = req.query.status as string | undefined;
      const reports = await BlogService.listReports(adminId, status);
      res.json({ success: true, data: reports });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async resolveReport(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user!.userId;
      const { action } = req.body;
      if (!action || (action !== "RESOLVED" && action !== "DISMISSED")) {
        res.status(400).json({ success: false, error: "Action must be 'RESOLVED' or 'DISMISSED'." });
        return;
      }
      const updated = await BlogService.resolveReport(adminId, req.params.reportId, action);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else if (err.message === "REPORT_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Report not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async moderatePost(req: Request, res: Response): Promise<void> {
    try {
      const moderatorId = req.user!.userId;
      const { action, note } = req.body;

      if (!action || !["APPROVE", "REJECT", "ARCHIVE"].includes(action)) {
        res.status(400).json({ success: false, error: "Action must be APPROVE, REJECT, or ARCHIVE." });
        return;
      }

      const updated = await BlogService.moderatePost(moderatorId, req.params.id, action, note);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else if (err.message === "POST_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Blog post not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  // ==========================================
  // 5. COVER IMAGE UPLOAD
  // ==========================================

  static async uploadCoverImage(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: "No image file provided." });
        return;
      }

      const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedMimes.includes(req.file.mimetype)) {
        res.status(400).json({ success: false, error: "Invalid image format. Allowed: JPEG, PNG, WEBP, GIF." });
        return;
      }

      // Max 5 MB
      if (req.file.size > 5 * 1024 * 1024) {
        res.status(400).json({ success: false, error: "Cover image must not exceed 5 MB." });
        return;
      }

      const meta = StorageService.saveFile(
        req.file.buffer,
        "uploads",
        req.file.originalname,
        req.file.mimetype
      );

      res.status(201).json({
        success: true,
        data: {
          fileKey: meta.fileKey,
          fileUrl: `/storage/${meta.fileKey}`,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
