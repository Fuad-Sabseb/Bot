import { Request, Response } from "express";
import { AIService } from "./ai.service";

export class AIController {
  // ==========================================
  // 1. QUOTA
  // ==========================================

  static async getQuota(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const quota = await AIService.getUserQuota(userId);
      res.json({ success: true, data: quota });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ==========================================
  // 2. CONVERSATIONS
  // ==========================================

  static async listConversations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const convos = await AIService.listConversations(userId);
      res.json({ success: true, data: convos });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async createConversation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { title } = req.body;
      const convo = await AIService.createConversation(userId, title);
      res.status(201).json({ success: true, data: convo });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const convo = await AIService.getConversation(userId, req.params.id);
      res.json({ success: true, data: convo });
    } catch (err: any) {
      if (err.message === "CONVERSATION_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Conversation not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await AIService.deleteConversation(userId, req.params.id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === "CONVERSATION_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Conversation not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const conversationId = req.params.id;
      const { prompt, mode, courseOfferingId } = req.body;

      const result = await AIService.sendMessage(userId, conversationId, prompt, {
        mode,
        courseOfferingId,
      });

      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === "CONVERSATION_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Conversation not found." });
      } else if (err.message.startsWith("QUOTA_EXCEEDED")) {
        res.status(429).json({ success: false, error: err.message });
      } else if (err.message.startsWith("INVALID_INPUT")) {
        res.status(400).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async ask(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { prompt, mode, courseOfferingId } = req.body;

      const result = await AIService.askAssistant(userId, prompt, {
        mode,
        courseOfferingId,
      });

      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message.startsWith("QUOTA_EXCEEDED")) {
        res.status(429).json({ success: false, error: err.message });
      } else if (err.message.startsWith("INVALID_INPUT")) {
        res.status(400).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  // ==========================================
  // 3. RAG INDEXING
  // ==========================================

  static async indexMaterial(req: Request, res: Response): Promise<void> {
    try {
      const { materialId } = req.params;
      const { content } = req.body;

      const result = await AIService.indexMaterial(materialId, content);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === "MATERIAL_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Learning material not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  // ==========================================
  // 4. ADMIN ANALYTICS & QUOTA CONTROL
  // ==========================================

  static async getAdminAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user!.userId;
      const analytics = await AIService.getAdminAnalytics(adminId);
      res.json({ success: true, data: analytics });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async updateUserQuota(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user!.userId;
      const targetUserId = req.params.userId;
      const { dailyLimit, monthlyLimit } = req.body;

      const updated = await AIService.updateUserQuota(
        adminId,
        targetUserId,
        Number(dailyLimit),
        Number(monthlyLimit)
      );

      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else if (err.message.startsWith("INVALID_INPUT")) {
        res.status(400).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }
}
