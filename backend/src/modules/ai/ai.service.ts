import { prisma } from "../../database/prisma";
import { getAIProvider, CompletionOptions } from "./ai.provider";
import { ModerationStatus } from "@prisma/client";

export class AIService {
  /**
   * Helper: Check if user is Global Admin.
   */
  static async isGlobalAdmin(userId: string): Promise<boolean> {
    const admin = await prisma.userGlobalRole.findFirst({
      where: { userId, role: "ADMIN" },
    });
    return !!admin;
  }

  // ==========================================
  // 1. QUOTA & USAGE MANAGEMENT
  // ==========================================

  /**
   * Get or initialize user quota with automatic 24-hour daily reset.
   */
  static async getUserQuota(userId: string) {
    let quota = await prisma.aIUserQuota.findUnique({
      where: { userId },
    });

    const now = new Date();

    if (!quota) {
      quota = await prisma.aIUserQuota.create({
        data: {
          userId,
          dailyTokenLimit: 50000,
          dailyTokensUsed: 0,
          monthlyTokenLimit: 1000000,
          monthlyTokensUsed: 0,
          lastResetDate: now,
        },
      });
    } else {
      // Check if 24 hours have elapsed since last reset
      const msSinceReset = now.getTime() - quota.lastResetDate.getTime();
      if (msSinceReset >= 24 * 60 * 60 * 1000) {
        quota = await prisma.aIUserQuota.update({
          where: { userId },
          data: {
            dailyTokensUsed: 0,
            lastResetDate: now,
          },
        });
      }
    }

    const dailyRemaining = Math.max(0, quota.dailyTokenLimit - quota.dailyTokensUsed);
    const monthlyRemaining = Math.max(0, quota.monthlyTokenLimit - quota.monthlyTokensUsed);

    return {
      dailyTokenLimit: quota.dailyTokenLimit,
      dailyTokensUsed: quota.dailyTokensUsed,
      dailyRemaining,
      monthlyTokenLimit: quota.monthlyTokenLimit,
      monthlyTokensUsed: quota.monthlyTokensUsed,
      monthlyRemaining,
      lastResetDate: quota.lastResetDate,
    };
  }

  /**
   * Enforce quota and record AI token usage.
   */
  static async recordUsage(
    userId: string,
    conversationId: string | null,
    tokens: { promptTokens: number; completeTokens: number; totalTokens: number; model: string }
  ) {
    const quota = await this.getUserQuota(userId);

    if (quota.dailyTokensUsed + tokens.totalTokens > quota.dailyTokenLimit) {
      throw new Error(`QUOTA_EXCEEDED: Daily AI token limit of ${quota.dailyTokenLimit} exceeded. Resets in 24 hours.`);
    }

    // Update quota counters
    await prisma.aIUserQuota.update({
      where: { userId },
      data: {
        dailyTokensUsed: { increment: tokens.totalTokens },
        monthlyTokensUsed: { increment: tokens.totalTokens },
      },
    });

    // Record usage log
    const costEstimate = tokens.totalTokens * 0.000002;
    await prisma.aIUsageRecord.create({
      data: {
        userId,
        conversationId,
        model: tokens.model,
        promptTokens: tokens.promptTokens,
        completeTokens: tokens.completeTokens,
        totalTokens: tokens.totalTokens,
        costEstimate,
      },
    });

    return {
      dailyRemaining: Math.max(0, quota.dailyRemaining - tokens.totalTokens),
      costEstimate,
    };
  }

  // ==========================================
  // 2. DOCUMENT CHUNKING & RAG INDEXING
  // ==========================================

  /**
   * Index approved learning material into DocumentChunk records for RAG retrieval.
   */
  static async indexMaterial(materialId: string, customContent?: string) {
    const material = await prisma.learningMaterial.findUnique({
      where: { id: materialId },
      include: {
        courseOffering: { include: { course: true } },
      },
    });

    if (!material || material.isDeleted) {
      throw new Error("MATERIAL_NOT_FOUND");
    }

    const rawText = (customContent || `${material.title}\n${material.description || ""}\nCourse: ${material.courseOffering.course.code} ${material.courseOffering.course.title}`).trim();

    // Chunk text into segments (~400 characters)
    const chunkSize = 400;
    const chunks: string[] = [];
    for (let i = 0; i < rawText.length; i += chunkSize) {
      chunks.push(rawText.slice(i, i + chunkSize));
    }

    const provider = getAIProvider();

    // Transactionally update chunks
    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { materialId } });

      for (let idx = 0; idx < chunks.length; idx++) {
        const chunkText = chunks[idx];
        const tokenCount = Math.max(1, Math.round(chunkText.length / 4));

        await tx.documentChunk.create({
          data: {
            materialId,
            chunkIndex: idx,
            content: chunkText,
            tokenCount,
            metadata: JSON.stringify({
              courseCode: material.courseOffering.course.code,
              courseTitle: material.courseOffering.course.title,
              category: material.category,
            }),
          },
        });
      }
    });

    return {
      materialId,
      indexedChunks: chunks.length,
      materialTitle: material.title,
    };
  }

  /**
   * Retrieve grounded document context matching student query (RAG).
   */
  static async retrieveGroundedContext(query: string, courseOfferingId?: string, limit = 3) {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 2);

    // 1. Search indexed document chunks
    const chunkWhere: any = {};
    if (words.length > 0) {
      chunkWhere.OR = words.map((w) => ({
        content: { contains: w, mode: "insensitive" },
      }));
    }

    if (courseOfferingId) {
      chunkWhere.material = {
        courseOfferingId,
        isDeleted: false,
        status: ModerationStatus.APPROVED,
      };
    } else {
      chunkWhere.material = {
        isDeleted: false,
        status: ModerationStatus.APPROVED,
      };
    }

    const matchedChunks = await prisma.documentChunk.findMany({
      where: chunkWhere,
      take: limit,
      include: {
        material: {
          include: {
            courseOffering: { include: { course: true } },
          },
        },
      },
    });

    const docs: Array<{ title: string; content: string; source: string }> = [];

    matchedChunks.forEach((c) => {
      docs.push({
        title: `${c.material.courseOffering.course.code}: ${c.material.title}`,
        content: c.content,
        source: `${c.material.courseOffering.course.code} - ${c.material.title} (Chunk #${c.chunkIndex + 1})`,
      });
    });

    // 2. If no chunks found, search approved learning materials directly
    if (docs.length === 0) {
      const matWhere: any = {
        isDeleted: false,
        status: ModerationStatus.APPROVED,
      };
      if (courseOfferingId) matWhere.courseOfferingId = courseOfferingId;
      if (words.length > 0) {
        matWhere.OR = words.map((w) => ({
          title: { contains: w, mode: "insensitive" },
        }));
      }

      const mats = await prisma.learningMaterial.findMany({
        where: matWhere,
        take: limit,
        include: { courseOffering: { include: { course: true } } },
      });

      mats.forEach((m) => {
        docs.push({
          title: `${m.courseOffering.course.code}: ${m.title}`,
          content: m.description || m.title,
          source: `${m.courseOffering.course.code} - ${m.title}`,
        });
      });
    }

    return docs;
  }

  // ==========================================
  // 3. CONVERSATIONS & CHAT ENGINE
  // ==========================================

  /**
   * Create a new conversation thread.
   */
  static async createConversation(userId: string, title?: string) {
    return prisma.aIConversation.create({
      data: {
        userId,
        title: title?.trim() || "New Academic Chat",
      },
    });
  }

  /**
   * List user's conversations ordered by recent activity.
   */
  static async listConversations(userId: string) {
    const convos = await prisma.aIConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { content: true, role: true, createdAt: true },
        },
      },
    });

    return convos.map((c) => ({
      id: c.id,
      title: c.title,
      messageCount: c._count.messages,
      lastMessage: c.messages[0] || null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * Get single conversation with full message history.
   */
  static async getConversation(userId: string, conversationId: string) {
    const convo = await prisma.aIConversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!convo || convo.userId !== userId) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }

    return {
      id: convo.id,
      title: convo.title,
      createdAt: convo.createdAt,
      updatedAt: convo.updatedAt,
      messages: convo.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources ? JSON.parse(m.sources) : null,
        tokensUsed: m.tokensUsed,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Delete conversation thread.
   */
  static async deleteConversation(userId: string, conversationId: string) {
    const convo = await prisma.aIConversation.findUnique({
      where: { id: conversationId },
    });

    if (!convo || convo.userId !== userId) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }

    await prisma.aIConversation.delete({
      where: { id: conversationId },
    });

    return { success: true };
  }

  /**
   * Send message in conversation, retrieve RAG context, and generate grounded AI response.
   */
  static async sendMessage(
    userId: string,
    conversationId: string,
    prompt: string,
    options?: {
      mode?: "general" | "summarize" | "code" | "math" | "exam_prep" | "study_plan";
      courseOfferingId?: string;
    }
  ) {
    if (!prompt || !prompt.trim()) {
      throw new Error("INVALID_INPUT: Message prompt is required.");
    }

    const convo = await prisma.aIConversation.findUnique({
      where: { id: conversationId },
    });
    if (!convo || convo.userId !== userId) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }

    // 1. Quota Pre-check
    const currentQuota = await this.getUserQuota(userId);
    if (currentQuota.dailyRemaining <= 0) {
      throw new Error(`QUOTA_EXCEEDED: Daily AI token limit of ${currentQuota.dailyTokenLimit} exceeded.`);
    }

    // 2. RAG Document Retrieval
    const groundedDocs = await this.retrieveGroundedContext(prompt, options?.courseOfferingId);

    // 3. AI Provider Generation
    const provider = getAIProvider();
    const result = await provider.generateCompletion(prompt, {
      mode: options?.mode,
      documents: groundedDocs,
    });

    // 4. Save User Message
    await prisma.aIMessage.create({
      data: {
        conversationId,
        role: "user",
        content: prompt.trim(),
        tokensUsed: result.promptTokens,
      },
    });

    // 5. Save Assistant Message
    const assistantMsg = await prisma.aIMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: result.content,
        sources: result.sources ? JSON.stringify(result.sources) : null,
        tokensUsed: result.completeTokens,
      },
    });

    // 6. Update Conversation Title & Timestamp
    const updateData: any = { updatedAt: new Date() };
    if (convo.title === "New Academic Chat" || convo.title === "New Conversation") {
      updateData.title = prompt.trim().slice(0, 40) + (prompt.length > 40 ? "..." : "");
    }
    await prisma.aIConversation.update({
      where: { id: conversationId },
      data: updateData,
    });

    // 7. Enforce Quota & Record Usage
    const usage = await this.recordUsage(userId, conversationId, result);

    return {
      message: {
        id: assistantMsg.id,
        role: assistantMsg.role,
        content: assistantMsg.content,
        sources: result.sources || null,
        tokensUsed: result.totalTokens,
        createdAt: assistantMsg.createdAt,
      },
      tokensUsed: result.totalTokens,
      dailyRemaining: usage.dailyRemaining,
    };
  }

  /**
   * Direct Assistant Query (for Telegram or single Q&A without conversation persistence).
   */
  static async askAssistant(
    userId: string,
    prompt: string,
    options?: { courseOfferingId?: string; mode?: "general" | "summarize" | "code" | "math" | "exam_prep" | "study_plan" }
  ) {
    if (!prompt || !prompt.trim()) {
      throw new Error("INVALID_INPUT: Query prompt is required.");
    }

    const currentQuota = await this.getUserQuota(userId);
    if (currentQuota.dailyRemaining <= 0) {
      throw new Error(`QUOTA_EXCEEDED: Daily AI token limit of ${currentQuota.dailyTokenLimit} exceeded.`);
    }

    const groundedDocs = await this.retrieveGroundedContext(prompt, options?.courseOfferingId);
    const provider = getAIProvider();
    const result = await provider.generateCompletion(prompt, {
      mode: options?.mode,
      documents: groundedDocs,
    });

    const usage = await this.recordUsage(userId, null, result);

    return {
      answer: result.content,
      sources: result.sources || null,
      tokensUsed: result.totalTokens,
      dailyRemaining: usage.dailyRemaining,
    };
  }

  // ==========================================
  // 4. ADMINISTRATOR AI ANALYTICS & QUOTA CONTROL
  // ==========================================

  /**
   * Administrator institutional AI usage analytics.
   */
  static async getAdminAnalytics(adminId: string) {
    const isAdmin = await this.isGlobalAdmin(adminId);
    if (!isAdmin) throw new Error("FORBIDDEN: Only administrators can view AI analytics.");

    const records = await prisma.aIUsageRecord.findMany({
      include: {
        user: { select: { id: true, fullName: true, campusId: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalRequests = records.length;
    const totalTokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
    const totalCost = records.reduce((sum, r) => sum + r.costEstimate, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRecords = records.filter((r) => r.createdAt >= today);
    const activeUsersToday = new Set(todayRecords.map((r) => r.userId)).size;

    // Aggregate user consumption
    const userMap = new Map<string, { user: any; tokens: number; requests: number }>();
    records.forEach((r) => {
      const entry = userMap.get(r.userId) || { user: r.user, tokens: 0, requests: 0 };
      entry.tokens += r.totalTokens;
      entry.requests += 1;
      userMap.set(r.userId, entry);
    });

    const topUsers = Array.from(userMap.values())
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10);

    return {
      totalRequests,
      totalTokens,
      totalCostEstimated: Math.round(totalCost * 1000) / 1000,
      activeUsersToday,
      topUsers,
      recentRecords: records.slice(0, 20).map((r) => ({
        id: r.id,
        user: r.user,
        model: r.model,
        totalTokens: r.totalTokens,
        costEstimate: r.costEstimate,
        createdAt: r.createdAt,
      })),
    };
  }

  /**
   * Administrator: Update student token quota limit.
   */
  static async updateUserQuota(
    adminId: string,
    targetUserId: string,
    dailyLimit: number,
    monthlyLimit: number
  ) {
    const isAdmin = await this.isGlobalAdmin(adminId);
    if (!isAdmin) throw new Error("FORBIDDEN: Only administrators can modify student quotas.");

    if (dailyLimit < 1000 || monthlyLimit < 1000) {
      throw new Error("INVALID_INPUT: Quota limits must be at least 1,000 tokens.");
    }

    return prisma.aIUserQuota.upsert({
      where: { userId: targetUserId },
      create: {
        userId: targetUserId,
        dailyTokenLimit: dailyLimit,
        monthlyTokenLimit: monthlyLimit,
        dailyTokensUsed: 0,
        monthlyTokensUsed: 0,
        lastResetDate: new Date(),
      },
      update: {
        dailyTokenLimit: dailyLimit,
        monthlyTokenLimit: monthlyLimit,
      },
    });
  }
}
