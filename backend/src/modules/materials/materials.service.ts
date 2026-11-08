import path from "path";
import { prisma } from "../../database/prisma";
import { MaterialCategory, ModerationStatus, NotificationType } from "@prisma/client";
import { StorageService } from "../../services/storage.service";
import { sendTelegramNotification } from "../telegram/bot";

export interface CreateMaterialInput {
  courseOfferingId: string;
  title: string;
  description?: string;
  category: MaterialCategory;
  tags?: string;
}

export interface UpdateMaterialInput {
  title?: string;
  description?: string;
  category?: MaterialCategory;
  tags?: string;
}

export interface MaterialQueryFilters {
  courseOfferingId?: string;
  courseId?: string;
  academicYearId?: string;
  semesterId?: string;
  category?: MaterialCategory;
  search?: string;
  status?: ModerationStatus;
  sortBy?: "newest" | "downloads" | "title";
  page?: number;
  limit?: number;
}

// Supported MIME types and extensions for academic materials
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/javascript",
  "text/x-python",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-tar",
  "application/gzip",
  "image/png",
  "image/jpeg",
]);

export class MaterialsService {
  /**
   * Helper: Check if user is Global Admin.
   */
  static async isGlobalAdmin(userId: string): Promise<boolean> {
    const role = await prisma.userGlobalRole.findFirst({
      where: { userId, role: "ADMIN" },
    });
    return !!role;
  }

  /**
   * Helper: Check if user is instructor for the course offering.
   */
  static async isCourseInstructor(userId: string, courseOfferingId: string): Promise<boolean> {
    const role = await prisma.userCourseRole.findFirst({
      where: {
        userId,
        courseOfferingId,
        role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR"] },
      },
    });
    return !!role;
  }

  /**
   * Helper: Check if user is class rep for the class linked to the course offering.
   */
  static async isClassRepForOffering(userId: string, courseOfferingId: string): Promise<boolean> {
    const offering = await prisma.courseOffering.findUnique({
      where: { id: courseOfferingId },
      select: { classId: true },
    });
    if (!offering) return false;

    const classRole = await prisma.userClassRole.findFirst({
      where: {
        userId,
        classId: offering.classId,
        role: "CLASS_REP",
      },
    });
    return !!classRole;
  }

  /**
   * Helper: Check if user is enrolled in the course offering.
   */
  static async isStudentEnrolled(userId: string, courseOfferingId: string): Promise<boolean> {
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId,
        courseOfferingId,
        status: "ACTIVE",
      },
    });
    return !!enrollment;
  }

  /**
   * Validate uploaded file type, extension, magic bytes, and size.
   */
  static validateUploadedFile(file: Express.Multer.File, maxSizeBytes = 100 * 1024 * 1024) {
    if (!file || !file.buffer) {
      throw new Error("FILE_REQUIRED: An academic resource file is required.");
    }

    if (file.size > maxSizeBytes) {
      throw new Error(
        `FILE_TOO_LARGE: File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds maximum limit of ${maxSizeBytes / 1024 / 1024}MB.`
      );
    }

    // 1. File extension validation against dangerous and allowed extensions
    const ext = path.extname(file.originalname).toLowerCase();
    const DANGEROUS_EXTENSIONS = new Set([
      ".exe", ".dll", ".so", ".dylib", ".bin", ".sh", ".bat", ".cmd",
      ".ps1", ".vbs", ".phtml", ".php", ".cgi", ".com", ".scr", ".msi",
    ]);

    if (!ext || DANGEROUS_EXTENSIONS.has(ext)) {
      throw new Error(`UNSUPPORTED_MIME_TYPE: File extension '${ext}' is not permitted.`);
    }

    const ALLOWED_EXTENSIONS = new Set([
      ".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".md", ".py",
      ".js", ".ts", ".java", ".cpp", ".c", ".h", ".hpp", ".json", ".csv",
      ".zip", ".tar", ".gz", ".png", ".jpg", ".jpeg",
    ]);

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`UNSUPPORTED_MIME_TYPE: File extension '${ext}' is not permitted.`);
    }

    // 2. MIME type check
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new Error(`UNSUPPORTED_MIME_TYPE: File type '${file.mimetype}' is not permitted.`);
    }

    // 3. Deep Magic-Bytes / Binary Content Signature Inspection
    const buf = file.buffer;
    if (buf.length >= 2) {
      // Reject Windows PE / DOS binary (MZ: 0x4D, 0x5A)
      if (buf[0] === 0x4d && buf[1] === 0x5a) {
        throw new Error("UNSUPPORTED_MIME_TYPE: Executable binary detected (PE/MZ).");
      }
    }
    if (buf.length >= 4) {
      // Reject Linux ELF binary (\x7FELF)
      if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
        throw new Error("UNSUPPORTED_MIME_TYPE: Executable binary detected (ELF).");
      }
      // Reject Mach-O binary (0xFEEDFACE / 0xCFFAEDFE)
      if (
        (buf[0] === 0xfe && buf[1] === 0xed && buf[2] === 0xfa && buf[3] === 0xce) ||
        (buf[0] === 0xcf && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe)
      ) {
        throw new Error("UNSUPPORTED_MIME_TYPE: Executable binary detected (Mach-O).");
      }
    }
  }

  /**
   * Upload and create a new learning material.
   */
  static async createMaterial(
    uploaderId: string,
    data: CreateMaterialInput,
    file: Express.Multer.File
  ) {
    this.validateUploadedFile(file);

    const offering = await prisma.courseOffering.findUnique({
      where: { id: data.courseOfferingId },
      include: {
        course: true,
      },
    });

    if (!offering || offering.isArchived) {
      throw new Error("COURSE_OFFERING_NOT_FOUND: The specified course offering does not exist or is archived.");
    }

    const isAdmin = await this.isGlobalAdmin(uploaderId);
    const isInstructor = await this.isCourseInstructor(uploaderId, data.courseOfferingId);
    const isRep = await this.isClassRepForOffering(uploaderId, data.courseOfferingId);
    const isEnrolled = await this.isStudentEnrolled(uploaderId, data.courseOfferingId);

    if (!isAdmin && !isInstructor && !isRep && !isEnrolled) {
      throw new Error("FORBIDDEN: You do not have permission to upload materials to this course offering.");
    }

    // Instructors and Admins are auto-approved; students/class reps go to PENDING moderation
    const initialStatus: ModerationStatus = isAdmin || isInstructor
      ? ModerationStatus.APPROVED
      : ModerationStatus.PENDING;

    // Save file safely via StorageService
    const stored = StorageService.saveFile(
      file.buffer,
      "materials",
      file.originalname,
      file.mimetype
    );

    const material = await prisma.learningMaterial.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        courseOfferingId: data.courseOfferingId,
        uploaderId,
        fileKey: stored.fileKey,
        fileUrl: `/api/v1/materials/${stored.fileKey}`,
        fileName: stored.originalName,
        fileSize: stored.fileSize,
        mimeType: stored.mimeType,
        fileSha256: stored.fileSha256,
        tags: data.tags,
        status: initialStatus,
        moderatedById: initialStatus === ModerationStatus.APPROVED ? uploaderId : null,
        moderatedAt: initialStatus === ModerationStatus.APPROVED ? new Date() : null,
      },
      include: {
        uploader: { select: { id: true, fullName: true, campusId: true } },
        courseOffering: {
          include: {
            course: true,
            class: true,
            semester: true,
          },
        },
      },
    });

    // If auto-approved, notify all enrolled students
    if (initialStatus === ModerationStatus.APPROVED) {
      await this.notifyEnrolledStudentsOfMaterial(material);
    }

    return material;
  }

  /**
   * Helper: Notify enrolled students of newly approved material.
   */
  static async notifyEnrolledStudentsOfMaterial(material: any) {
    const enrollments = await prisma.enrollment.findMany({
      where: { courseOfferingId: material.courseOfferingId, status: "ACTIVE" },
      select: { userId: true },
    });

    for (const e of enrollments) {
      // Avoid notifying the uploader
      if (e.userId === material.uploaderId) continue;

      await prisma.notification.create({
        data: {
          userId: e.userId,
          type: NotificationType.MATERIAL_NEW,
          title: `New Learning Material: ${material.title}`,
          message: `New resource uploaded in ${material.courseOffering.course.title}: "${material.title}" (${material.category.replace(/_/g, " ")}).`,
          link: `/materials/${material.id}`,
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: e.userId },
        include: { notificationPref: true },
      });

      if (user?.telegramChatId && (user.notificationPref?.channelTelegram ?? true)) {
        await sendTelegramNotification(
          user.telegramChatId,
          `📚 *New Learning Material Published*\n\n` +
            `Course: *${material.courseOffering.course.title}*\n` +
            `Title: *${material.title}*\n` +
            `Category: ${material.category}\n` +
            `Size: ${Math.round(material.fileSize / 1024)} KB\n\n` +
            `Log in to the academic portal to download.`
        );
      }
    }
  }

  /**
   * List and search materials with scoping and filters.
   */
  static async listMaterials(userId: string, filters: MaterialQueryFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const isAdmin = await this.isGlobalAdmin(userId);

    // Build Prisma query condition
    const where: any = {
      isDeleted: false,
    };

    if (filters.courseOfferingId) {
      where.courseOfferingId = filters.courseOfferingId;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.courseId) {
      where.courseOffering = { courseId: filters.courseId };
    }

    if (filters.academicYearId || filters.semesterId) {
      where.courseOffering = {
        ...where.courseOffering,
        semester: {
          ...(filters.semesterId ? { id: filters.semesterId } : {}),
          ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
        },
      };
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
        { tags: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    // Role-based visibility scoping:
    if (!isAdmin) {
      // Find offerings where user is instructor
      const instructed = await prisma.userCourseRole.findMany({
        where: {
          userId,
          role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR"] },
        },
        select: { courseOfferingId: true },
      });
      const instructedOfferingIds = new Set(instructed.map((i) => i.courseOfferingId));

      // Students/Class reps only see APPROVED materials, unless they are the uploader or instructor
      where.AND = [
        {
          OR: [
            { status: ModerationStatus.APPROVED },
            { uploaderId: userId },
            { courseOfferingId: { in: Array.from(instructedOfferingIds) } },
          ],
        },
      ];
    } else if (filters.status) {
      where.status = filters.status;
    }

    // Sorting
    let orderBy: any = { createdAt: "desc" };
    if (filters.sortBy === "downloads") {
      orderBy = { downloads: "desc" };
    } else if (filters.sortBy === "title") {
      orderBy = { title: "asc" };
    }

    const [materials, total] = await Promise.all([
      prisma.learningMaterial.findMany({
        where,
        include: {
          uploader: { select: { id: true, fullName: true, campusId: true } },
          courseOffering: {
            include: {
              course: true,
              class: true,
              semester: { include: { academicYear: true } },
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.learningMaterial.count({ where }),
    ]);

    return {
      materials,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single material detail with scoping.
   */
  static async getMaterialById(materialId: string, userId: string) {
    const material = await prisma.learningMaterial.findUnique({
      where: { id: materialId },
      include: {
        uploader: { select: { id: true, fullName: true, campusId: true, email: true } },
        moderatedBy: { select: { id: true, fullName: true } },
        courseOffering: {
          include: {
            course: true,
            class: true,
            semester: { include: { academicYear: true } },
          },
        },
      },
    });

    if (!material || material.isDeleted) {
      throw new Error("MATERIAL_NOT_FOUND");
    }

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, material.courseOfferingId);
    const isUploader = material.uploaderId === userId;
    const isEnrolled = await this.isStudentEnrolled(userId, material.courseOfferingId);

    // If not approved, only Admin, Instructor, or Uploader can view
    if (material.status !== ModerationStatus.APPROVED) {
      if (!isAdmin && !isInstructor && !isUploader) {
        throw new Error("FORBIDDEN: You do not have permission to view this pending or unapproved resource.");
      }
    } else {
      // Must be enrolled, instructor, or admin
      if (!isAdmin && !isInstructor && !isEnrolled && !isUploader) {
        throw new Error("FORBIDDEN: You are not enrolled in this course offering.");
      }
    }

    return material;
  }

  /**
   * Update material metadata.
   */
  static async updateMaterial(materialId: string, userId: string, data: UpdateMaterialInput) {
    const existing = await prisma.learningMaterial.findUnique({
      where: { id: materialId },
    });

    if (!existing || existing.isDeleted) {
      throw new Error("MATERIAL_NOT_FOUND");
    }

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, existing.courseOfferingId);
    const isUploader = existing.uploaderId === userId;

    if (!isAdmin && !isInstructor && !isUploader) {
      throw new Error("FORBIDDEN: You do not have permission to modify this learning material.");
    }

    // If an ordinary student edits their own resource, require re-moderation
    const newStatus = isAdmin || isInstructor ? existing.status : ModerationStatus.PENDING;

    return prisma.learningMaterial.update({
      where: { id: materialId },
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        tags: data.tags,
        status: newStatus,
      },
      include: {
        uploader: { select: { id: true, fullName: true } },
        courseOffering: { include: { course: true } },
      },
    });
  }

  /**
   * Soft-delete material (or purge from storage if admin).
   */
  static async deleteMaterial(materialId: string, userId: string, purge = false) {
    const existing = await prisma.learningMaterial.findUnique({
      where: { id: materialId },
    });

    if (!existing || existing.isDeleted) {
      throw new Error("MATERIAL_NOT_FOUND");
    }

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, existing.courseOfferingId);
    const isUploader = existing.uploaderId === userId;

    if (!isAdmin && !isInstructor && !isUploader) {
      throw new Error("FORBIDDEN: You do not have permission to delete this learning material.");
    }

    if (purge && isAdmin) {
      // Transactional cleanup: delete from database, then remove storage file
      await prisma.learningMaterial.delete({ where: { id: materialId } });
      StorageService.deleteFile(existing.fileKey);
      return { success: true, message: "Material permanently deleted and storage purged." };
    }

    // Soft delete
    await prisma.learningMaterial.update({
      where: { id: materialId },
      data: { isDeleted: true },
    });

    return { success: true, message: "Material successfully archived/deleted." };
  }

  /**
   * Download a material, checking access authorization and incrementing download count.
   */
  static async downloadMaterial(materialId: string, userId: string) {
    const material = await this.getMaterialById(materialId, userId);

    // Atomically increment download count
    await prisma.learningMaterial.update({
      where: { id: materialId },
      data: { downloads: { increment: 1 } },
    });

    const filePath = StorageService.getFilePath(material.fileKey);

    return {
      filePath,
      fileName: material.fileName,
      mimeType: material.mimeType,
      fileKey: material.fileKey,
    };
  }

  /**
   * Moderation Queue: list pending materials for instructors or admins.
   */
  static async getModerationQueue(userId: string) {
    const isAdmin = await this.isGlobalAdmin(userId);

    const where: any = {
      isDeleted: false,
      status: ModerationStatus.PENDING,
    };

    if (!isAdmin) {
      const instructed = await prisma.userCourseRole.findMany({
        where: {
          userId,
          role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR"] },
        },
        select: { courseOfferingId: true },
      });

      const offeringIds = instructed.map((i) => i.courseOfferingId);
      if (offeringIds.length === 0) {
        return [];
      }
      where.courseOfferingId = { in: offeringIds };
    }

    return prisma.learningMaterial.findMany({
      where,
      include: {
        uploader: { select: { id: true, fullName: true, campusId: true, email: true } },
        courseOffering: {
          include: {
            course: true,
            class: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Moderate a material (APPROVE, REJECT, ARCHIVE) with note.
   */
  static async moderateMaterial(
    materialId: string,
    moderatorUserId: string,
    status: ModerationStatus,
    note?: string
  ) {
    const material = await prisma.learningMaterial.findUnique({
      where: { id: materialId },
      include: { courseOffering: { include: { course: true } } },
    });

    if (!material || material.isDeleted) {
      throw new Error("MATERIAL_NOT_FOUND");
    }

    const isAdmin = await this.isGlobalAdmin(moderatorUserId);
    const isInstructor = await this.isCourseInstructor(moderatorUserId, material.courseOfferingId);

    if (!isAdmin && !isInstructor) {
      throw new Error("FORBIDDEN: You do not have permission to moderate materials for this course offering.");
    }

    const updated = await prisma.learningMaterial.update({
      where: { id: materialId },
      data: {
        status,
        moderatedById: moderatorUserId,
        moderatedAt: new Date(),
        moderationNote: note,
      },
      include: {
        uploader: { select: { id: true, fullName: true, campusId: true } },
        moderatedBy: { select: { id: true, fullName: true } },
        courseOffering: { include: { course: true, class: true } },
      },
    });

    // Notify uploader of moderation verdict
    await prisma.notification.create({
      data: {
        userId: material.uploaderId,
        type: NotificationType.SYSTEM_ALERT,
        title: `Material Moderation: ${material.title}`,
        message: `Your resource "${material.title}" has been ${status.toLowerCase()}.${note ? ` Reason: "${note}"` : ""}`,
        link: `/materials/${material.id}`,
      },
    });

    // If approved, notify enrolled students
    if (status === ModerationStatus.APPROVED) {
      await this.notifyEnrolledStudentsOfMaterial(updated);
    }

    return updated;
  }

  /**
   * Academic resource usage analytics and metrics.
   */
  static async getMaterialStats(userId: string) {
    const isAdmin = await this.isGlobalAdmin(userId);

    const [totalResources, totalDownloads, categoryCounts, topDownloaded] = await Promise.all([
      prisma.learningMaterial.count({ where: { isDeleted: false, status: ModerationStatus.APPROVED } }),
      prisma.learningMaterial.aggregate({
        where: { isDeleted: false },
        _sum: { downloads: true },
      }),
      prisma.learningMaterial.groupBy({
        by: ["category"],
        where: { isDeleted: false, status: ModerationStatus.APPROVED },
        _count: { id: true },
      }),
      prisma.learningMaterial.findMany({
        where: { isDeleted: false, status: ModerationStatus.APPROVED },
        orderBy: { downloads: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          category: true,
          downloads: true,
          courseOffering: { select: { course: { select: { code: true, title: true } } } },
        },
      }),
    ]);

    return {
      totalResources,
      totalDownloads: totalDownloads._sum.downloads || 0,
      categoryDistribution: categoryCounts.map((c) => ({
        category: c.category,
        count: c._count.id,
      })),
      topDownloaded,
    };
  }
}
