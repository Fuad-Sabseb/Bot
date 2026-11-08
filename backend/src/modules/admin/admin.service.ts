import { prisma } from "../../database/prisma";
import fs from "fs";
import path from "path";
import os from "os";
import { getTelegramBot } from "../telegram/bot";
import { StorageService } from "../../services/storage.service";
import { getAIProvider } from "../ai/ai.provider";
import { RealtimeService } from "../realtime/realtime.service";

export class AdminService {
  /**
   * Aggregate comprehensive institutional analytics across all 9 modules.
   */
  static async getInstitutionalAnalytics() {
    // 1. User & Enrollment Metrics
    const [
      totalUsers,
      verifiedStudents,
      activeUsers,
      totalClasses,
      totalCourses,
      activeOfferings,
      currentYear,
      currentSemester,
    ] = await Promise.all([
      prisma.user.count({ where: { isDeleted: false } }),
      prisma.user.count({ where: { isVerified: true, isDeleted: false } }),
      prisma.user.count({ where: { isActive: true, isDeleted: false } }),
      prisma.class.count({ where: { isArchived: false } }),
      prisma.course.count({ where: { isArchived: false } }),
      prisma.courseOffering.count({ where: { isArchived: false } }),
      prisma.academicYear.findFirst({ where: { isCurrent: true } }),
      prisma.semester.findFirst({ where: { isCurrent: true }, include: { academicYear: true } }),
    ]);

    // 2. Assignment & Grading Metrics
    const [totalAssignments, totalSubmissions, gradedSubmissions] = await Promise.all([
      prisma.assignment.count({ where: { isArchived: false } }),
      prisma.assignmentSubmission.count({ where: { isCurrentVersion: true } }),
      prisma.assignmentSubmission.count({
        where: { isCurrentVersion: true, status: "GRADED" },
      }),
    ]);

    const assignmentCompletionRate =
      totalAssignments > 0
        ? Math.min(100, Math.round((totalSubmissions / (totalAssignments * Math.max(1, verifiedStudents))) * 100))
        : 0;

    // 3. Materials & Archive Metrics
    const [
      totalMaterials,
      pendingMaterials,
      totalArchiveResources,
      pendingArchiveResources,
      topDownloadedMaterials,
    ] = await Promise.all([
      prisma.learningMaterial.count({ where: { status: "APPROVED", isDeleted: false } }),
      prisma.learningMaterial.count({ where: { status: "PENDING", isDeleted: false } }),
      prisma.archivedResource.count({ where: { status: "APPROVED", isDeleted: false } }),
      prisma.archivedResource.count({ where: { status: "PENDING", isDeleted: false } }),
      prisma.learningMaterial.findMany({
        where: { status: "APPROVED", isDeleted: false },
        orderBy: { downloads: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          category: true,
          downloads: true,
          courseOffering: { select: { course: { select: { code: true } } } },
        },
      }),
    ]);

    // 4. Assessment & Quiz Engine Metrics
    const [totalQuestions, totalQuizzes, completedAttempts, passedAttempts, avgScoreResult] =
      await Promise.all([
        prisma.practiceQuestion.count({ where: { isDeleted: false } }),
        prisma.quiz.count({ where: { isArchived: false } }),
        prisma.quizAttempt.count({ where: { status: "COMPLETED" } }),
        prisma.quizAttempt.count({ where: { status: "COMPLETED", passed: true } }),
        prisma.quizAttempt.aggregate({
          where: { status: "COMPLETED" },
          _avg: { score: true },
        }),
      ]);

    const quizPassRate =
      completedAttempts > 0
        ? Math.round((passedAttempts / completedAttempts) * 100)
        : 0;
    const averageQuizScore = Math.round(avgScoreResult._avg?.score || 0);

    // 5. Community & Student Blog Metrics
    const [totalPosts, pendingPosts, pendingReports] = await Promise.all([
      prisma.blogPost.count({ where: { status: "APPROVED", isDeleted: false } }),
      prisma.blogPost.count({ where: { status: "PENDING", isDeleted: false } }),
      prisma.blogReport.count({ where: { status: "PENDING" } }),
    ]);

    // 6. Institutional AI Assistant Metrics
    const [aiTotalTokensResult, aiActiveConversations, aiTopUsers] = await Promise.all([
      prisma.aIUsageRecord.aggregate({
        _sum: { totalTokens: true },
        _count: { id: true },
      }),
      prisma.aIConversation.count(),
      prisma.aIUserQuota.findMany({
        orderBy: { dailyTokensUsed: "desc" },
        take: 5,
        include: {
          user: {
            select: { id: true, fullName: true, campusId: true },
          },
        },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        verifiedStudents,
        activeUsers,
        unverified: totalUsers - verifiedStudents,
      },
      academic: {
        currentAcademicYear: currentYear?.name || "None active",
        currentSemester: currentSemester?.name || "None active",
        totalClasses,
        totalCourses,
        activeOfferings,
      },
      assignments: {
        totalCreated: totalAssignments,
        totalSubmissions,
        gradedSubmissions,
        pendingGrading: totalSubmissions - gradedSubmissions,
        completionRate: assignmentCompletionRate,
      },
      resources: {
        approvedMaterials: totalMaterials,
        pendingMaterialsModeration: pendingMaterials,
        approvedArchiveItems: totalArchiveResources,
        pendingArchiveModeration: pendingArchiveResources,
        topDownloads: topDownloadedMaterials.map((m) => ({
          id: m.id,
          title: m.title,
          courseCode: m.courseOffering.course.code,
          category: m.category,
          downloads: m.downloads,
        })),
      },
      assessments: {
        totalQuestionsInBank: totalQuestions,
        totalQuizzesPublished: totalQuizzes,
        completedAttempts,
        passRate: quizPassRate,
        averagePercentageScore: averageQuizScore,
      },
      community: {
        publishedArticles: totalPosts,
        pendingPostsModeration: pendingPosts,
        pendingReportsQueue: pendingReports,
      },
      ai: {
        totalRequests: aiTotalTokensResult._count.id || 0,
        totalTokensConsumed: aiTotalTokensResult._sum.totalTokens || 0,
        activeConversations: aiActiveConversations,
        topConsumers: aiTopUsers.map((u) => ({
          userId: u.userId,
          fullName: u.user.fullName,
          campusId: u.user.campusId,
          dailyTokensUsed: u.dailyTokensUsed,
          dailyTokenLimit: u.dailyTokenLimit,
        })),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Health and operational status of infrastructure components.
   */
  static async getSystemHealth() {
    const startTime = Date.now();
    let dbStatus = "healthy";
    let dbLatencyMs = 0;

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - startTime;
    } catch {
      dbStatus = "unreachable";
    }

    // Storage accessibility checks
    const storagePaths = [
      path.resolve(process.cwd(), "storage", "assignments"),
      path.resolve(process.cwd(), "storage", "materials"),
      path.resolve(process.cwd(), "storage", "archive"),
    ];

    const storageStatus = storagePaths.map((p) => ({
      path: p,
      exists: fs.existsSync(p),
      writable: (() => {
        try {
          if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
          const testFile = path.join(p, `.health_test_${Date.now()}`);
          fs.writeFileSync(testFile, "ok");
          fs.unlinkSync(testFile);
          return true;
        } catch {
          return false;
        }
      })(),
    }));

    const botInstance = getTelegramBot();
    const telegramStatus = botInstance ? "connected" : "disabled_or_not_configured";

    const memory = process.memoryUsage();
    const aiProvider = getAIProvider();

    return {
      status: dbStatus === "healthy" ? "healthy" : "degraded",
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        provider: "Neon Serverless Postgres with pgvector",
      },
      neon: {
        branch: process.env.NEON_BRANCH || "production",
        branchId: process.env.NEON_BRANCH_ID,
        postgres: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
          pooled: Boolean(process.env.DATABASE_URL?.includes("-pooler")),
        },
        objectStorage: {
          configured: StorageService.isS3Configured(),
          bucket: process.env.AWS_BUCKET || "assets",
          endpoint: process.env.AWS_ENDPOINT_URL_S3 ? "configured" : "missing",
        },
        aiGateway: {
          configured: Boolean(process.env.NEON_AI_GATEWAY_BASE_URL && process.env.NEON_AI_GATEWAY_TOKEN),
          provider: aiProvider.name,
          endpoint: process.env.NEON_AI_GATEWAY_BASE_URL ? "configured" : "missing",
        },
        realtime: {
          configured: RealtimeService.isConfigured(),
          endpoint: process.env.NEON_REALTIME_URL ? "configured" : "missing",
        },
      },
      telegramBot: {
        status: telegramStatus,
      },
      storage: {
        healthy: storageStatus.every((s) => s.exists && s.writable),
        directories: storageStatus,
      },
      runtime: {
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memoryUsageMb: {
          heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
          heapTotal: Math.round(memory.heapTotal / (1024 * 1024)),
          rss: Math.round(memory.rss / (1024 * 1024)),
        },
        cpuCores: os.cpus().length,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Retrieve administrative audit logs with pagination and filters.
   */
  static async getAuditLogs(query: { page?: number; limit?: number; action?: string }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.action) {
      where.action = query.action;
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, fullName: true, campusId: true, email: true } },
          target: { select: { id: true, fullName: true, campusId: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Record an administrative audit action.
   */
  static async logAction(data: {
    actorUserId?: string;
    targetUserId?: string;
    action: string;
    entity: string;
    entityId?: string;
    details?: string;
    ipAddress?: string;
  }) {
    return prisma.auditLog.create({
      data: {
        actorUserId: data.actorUserId,
        targetUserId: data.targetUserId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        details: data.details,
        ipAddress: data.ipAddress,
      },
    });
  }
}
