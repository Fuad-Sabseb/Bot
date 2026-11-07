import path from "path";
import { prisma } from "../../database/prisma";
import { ModerationStatus, NotificationType } from "@prisma/client";
import { StorageService } from "../../services/storage.service";
import { sendTelegramNotification } from "../telegram/bot";

export interface CreateArchiveResourceInput {
  courseOfferingId: string;
  title: string;
  description?: string;
  resourceType: "PAST_EXAM" | "PROJECT" | "SOLUTION" | "REFERENCE" | string;
  assessmentType?: "MIDTERM" | "FINAL" | "QUIZ" | "LAB_EXAM" | "PRACTICAL_EXAM" | "GRADUATION_PROJECT" | "TERM_PROJECT" | "ASSIGNMENT" | "OTHER" | string;
  examYear?: number;
  isOfficial?: boolean;
  academicYearStr?: string;
  semesterNum?: number;
  tags?: string;
}

export interface UpdateArchiveResourceInput {
  title?: string;
  description?: string;
  resourceType?: string;
  assessmentType?: string;
  examYear?: number;
  isOfficial?: boolean;
  tags?: string;
}

export interface ArchiveQueryFilters {
  courseOfferingId?: string;
  courseId?: string;
  academicYearStr?: string;
  semesterNum?: number;
  examYear?: number;
  resourceType?: string;
  assessmentType?: string;
  isOfficial?: boolean;
  search?: string;
  status?: ModerationStatus | "ALL";
  sortBy?: "newest" | "examYear" | "downloads" | "title";
  page?: number;
  limit?: number;
}

// Supported MIME types and extensions for academic archive resources
export const ALLOWED_ARCHIVE_MIME_TYPES = new Set([
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

export class ArchiveService {
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
   * Validate uploaded archive file type, extension, magic bytes, and size.
   */
  static validateUploadedFile(file: Express.Multer.File, maxSizeBytes = 100 * 1024 * 1024) {
    if (!file || !file.buffer) {
      throw new Error("FILE_REQUIRED: An academic archive file is required.");
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
    if (!ALLOWED_ARCHIVE_MIME_TYPES.has(file.mimetype)) {
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
   * Upload and create a new archived academic resource.
   */
  static async createResource(
    uploaderId: string,
    data: CreateArchiveResourceInput,
    file: Express.Multer.File
  ) {
    this.validateUploadedFile(file);

    const offering = await prisma.courseOffering.findUnique({
      where: { id: data.courseOfferingId },
      include: {
        course: true,
        semester: {
          include: {
            academicYear: true,
          },
        },
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
      throw new Error("FORBIDDEN: You do not have permission to upload archive materials to this course offering.");
    }

    // Official solution security constraint: Only instructors & admins can set isOfficial = true
    if (data.isOfficial && !isAdmin && !isInstructor) {
      throw new Error("FORBIDDEN: Only instructors and administrators can mark archive resources as official.");
    }

    // Instructors and Admins are auto-approved; students/class reps enter PENDING moderation status
    const initialStatus: ModerationStatus = isAdmin || isInstructor
      ? ModerationStatus.APPROVED
      : ModerationStatus.PENDING;

    // Resolve academic year string & semester number from offering hierarchy if not supplied
    const academicYearStr =
      data.academicYearStr ||
      offering.semester?.academicYear?.name ||
      "2023/2024";

    const semesterNum =
      data.semesterNum !== undefined
        ? data.semesterNum
        : offering.semester?.semesterNumber ?? 1;

    // Save file safely via StorageService in the 'archive' bucket
    const stored = StorageService.saveFile(
      file.buffer,
      "archive",
      file.originalname,
      file.mimetype
    );

    const resource = await prisma.archivedResource.create({
      data: {
        title: data.title,
        description: data.description,
        resourceType: data.resourceType,
        assessmentType: data.assessmentType,
        examYear: data.examYear ? Number(data.examYear) : undefined,
        isOfficial: isAdmin || isInstructor ? !!data.isOfficial : false,
        courseOfferingId: data.courseOfferingId,
        academicYearStr,
        semesterNum,
        uploaderId,
        fileKey: stored.fileKey,
        fileUrl: `/api/v1/archive/${stored.fileKey}`,
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

    // If resource is submitted for moderation by a student, notify instructors
    if (initialStatus === ModerationStatus.PENDING) {
      const instructors = await prisma.userCourseRole.findMany({
        where: {
          courseOfferingId: data.courseOfferingId,
          role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR"] },
        },
        include: { user: true },
      });

      for (const inst of instructors) {
        await prisma.notification.create({
          data: {
            userId: inst.userId,
            type: NotificationType.MATERIAL_NEW,
            title: "Archive Resource Pending Review",
            message: `A new archive submission "${data.title}" (${data.resourceType}) is pending your approval.`,
          },
        });

        if (inst.user.telegramChatId) {
          await sendTelegramNotification(
            inst.user.telegramChatId,
            `🏛️ *Archive Submission Pending Review*\n*Course:* ${offering.course.code} - ${offering.course.title}\n*Title:* ${data.title}\n*Type:* ${data.resourceType}\n*Uploader:* Student`
          );
        }
      }
    }

    return resource;
  }

  /**
   * Search, filter, and paginate academic archive resources.
   */
  static async listResources(userId: string, filters: ArchiveQueryFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const isAdmin = await this.isGlobalAdmin(userId);

    const where: any = {
      isDeleted: false,
    };

    if (filters.courseOfferingId) {
      where.courseOfferingId = filters.courseOfferingId;
    }

    if (filters.courseId) {
      where.courseOffering = { courseId: filters.courseId };
    }

    if (filters.academicYearStr) {
      where.academicYearStr = filters.academicYearStr;
    }

    if (filters.semesterNum !== undefined) {
      where.semesterNum = Number(filters.semesterNum);
    }

    if (filters.examYear !== undefined) {
      where.examYear = Number(filters.examYear);
    }

    if (filters.resourceType) {
      where.resourceType = filters.resourceType;
    }

    if (filters.assessmentType) {
      where.assessmentType = filters.assessmentType;
    }

    if (filters.isOfficial !== undefined) {
      where.isOfficial = filters.isOfficial;
    }

    // Moderation status filtering logic
    if (filters.status && filters.status !== "ALL") {
      if (isAdmin) {
        where.status = filters.status;
      } else {
        // Non-admin can only see PENDING or REJECTED if they are the uploader or course instructor
        if (filters.status === ModerationStatus.APPROVED) {
          where.status = ModerationStatus.APPROVED;
        } else {
          where.status = filters.status;
          where.OR = [
            { uploaderId: userId },
            {
              courseOffering: {
                courseRoles: {
                  some: {
                    userId,
                    role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR"] },
                  },
                },
              },
            },
          ];
        }
      }
    } else if (filters.status === "ALL" && isAdmin) {
      // Admin sees everything
    } else {
      // Default: regular users only see APPROVED resources unless they authored the item
      where.OR = [
        { status: ModerationStatus.APPROVED },
        { uploaderId: userId },
      ];
    }

    // Keyword search over title, description, or tags
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { tags: { contains: q, mode: "insensitive" } },
          ],
        },
      ];
    }

    // Sorting
    let orderBy: any = { createdAt: "desc" };
    if (filters.sortBy === "downloads") {
      orderBy = { downloads: "desc" };
    } else if (filters.sortBy === "title") {
      orderBy = { title: "asc" };
    } else if (filters.sortBy === "examYear") {
      orderBy = [{ examYear: "desc" }, { createdAt: "desc" }];
    }

    const [total, resources] = await Promise.all([
      prisma.archivedResource.count({ where }),
      prisma.archivedResource.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          uploader: { select: { id: true, fullName: true, campusId: true } },
          moderatedBy: { select: { id: true, fullName: true } },
          courseOffering: {
            include: {
              course: true,
              class: true,
              semester: true,
            },
          },
        },
      }),
    ]);

    return {
      resources,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieve a single archive resource by ID with authorization check.
   */
  static async getResourceById(resourceId: string, userId: string) {
    const resource = await prisma.archivedResource.findUnique({
      where: { id: resourceId },
      include: {
        uploader: { select: { id: true, fullName: true, campusId: true } },
        moderatedBy: { select: { id: true, fullName: true } },
        courseOffering: {
          include: {
            course: true,
            class: true,
            semester: true,
          },
        },
      },
    });

    if (!resource || resource.isDeleted) {
      throw new Error("RESOURCE_NOT_FOUND");
    }

    if (resource.status !== ModerationStatus.APPROVED) {
      const isAdmin = await this.isGlobalAdmin(userId);
      const isInstructor = await this.isCourseInstructor(userId, resource.courseOfferingId);
      const isUploader = resource.uploaderId === userId;

      if (!isAdmin && !isInstructor && !isUploader) {
        throw new Error("FORBIDDEN: You do not have permission to view this unapproved archive resource.");
      }
    }

    return resource;
  }

  /**
   * Retrieve moderation queue for an instructor or administrator.
   */
  static async getModerationQueue(userId: string, courseOfferingId?: string) {
    const isAdmin = await this.isGlobalAdmin(userId);

    const where: any = {
      isDeleted: false,
      status: ModerationStatus.PENDING,
    };

    if (courseOfferingId) {
      const isInstructor = await this.isCourseInstructor(userId, courseOfferingId);
      if (!isAdmin && !isInstructor) {
        throw new Error("FORBIDDEN: You do not have permission to moderate this course offering.");
      }
      where.courseOfferingId = courseOfferingId;
    } else if (!isAdmin) {
      // Find all course offerings where user is an instructor
      const instructorRoles = await prisma.userCourseRole.findMany({
        where: {
          userId,
          role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR"] },
        },
        select: { courseOfferingId: true },
      });

      const allowedOfferingIds = instructorRoles.map((r) => r.courseOfferingId);
      if (allowedOfferingIds.length === 0) {
        return [];
      }
      where.courseOfferingId = { in: allowedOfferingIds };
    }

    return prisma.archivedResource.findMany({
      where,
      orderBy: { createdAt: "asc" },
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
  }

  /**
   * Moderate an archive resource (Approve, Reject, or Archive).
   */
  static async moderateResource(
    moderatorId: string,
    resourceId: string,
    action: "APPROVE" | "REJECT" | "ARCHIVE",
    moderationNote?: string,
    isOfficial?: boolean
  ) {
    const resource = await prisma.archivedResource.findUnique({
      where: { id: resourceId },
      include: {
        courseOffering: { include: { course: true } },
        uploader: true,
      },
    });

    if (!resource || resource.isDeleted) {
      throw new Error("RESOURCE_NOT_FOUND");
    }

    const isAdmin = await this.isGlobalAdmin(moderatorId);
    const isInstructor = await this.isCourseInstructor(moderatorId, resource.courseOfferingId);

    if (!isAdmin && !isInstructor) {
      throw new Error("FORBIDDEN: You do not have permission to moderate archive resources for this course offering.");
    }

    if (resource.uploaderId === moderatorId && action === "APPROVE") {
      throw new Error("FORBIDDEN: Users cannot approve their own submissions.");
    }

    let nextStatus: ModerationStatus;
    if (action === "APPROVE") {
      nextStatus = ModerationStatus.APPROVED;
    } else if (action === "REJECT") {
      nextStatus = ModerationStatus.REJECTED;
    } else if (action === "ARCHIVE") {
      nextStatus = ModerationStatus.ARCHIVED;
    } else {
      throw new Error("INVALID_ACTION: Moderation action must be APPROVE, REJECT, or ARCHIVE.");
    }

    const updateData: any = {
      status: nextStatus,
      moderatedById: moderatorId,
      moderatedAt: new Date(),
      moderationNote: moderationNote || null,
    };

    if (action === "APPROVE" && isOfficial !== undefined) {
      updateData.isOfficial = !!isOfficial;
    }

    const updated = await prisma.archivedResource.update({
      where: { id: resourceId },
      data: updateData,
      include: {
        uploader: { select: { id: true, fullName: true, campusId: true } },
        moderatedBy: { select: { id: true, fullName: true } },
        courseOffering: { include: { course: true, class: true } },
      },
    });

    // Notify uploader about moderation outcome
    await prisma.notification.create({
      data: {
        userId: resource.uploaderId,
        type: NotificationType.MATERIAL_NEW,
        title: `Archive Submission ${action === "APPROVE" ? "Approved" : action === "REJECT" ? "Rejected" : "Archived"}`,
        message: `Your archive contribution "${resource.title}" was ${action.toLowerCase()}d.${moderationNote ? ` Note: ${moderationNote}` : ""}`,
      },
    });

    if (resource.uploader.telegramChatId) {
      const icon = action === "APPROVE" ? "✅" : "⚠️";
      await sendTelegramNotification(
        resource.uploader.telegramChatId,
        `${icon} *Archive Submission Update*\nYour contribution "*${resource.title}*" for *${resource.courseOffering.course.code}* was *${action}D*.\n${moderationNote ? `_Note: ${moderationNote}_` : ""}`
      );
    }

    return updated;
  }

  /**
   * Update archive resource metadata.
   */
  static async updateResource(
    userId: string,
    resourceId: string,
    data: UpdateArchiveResourceInput
  ) {
    const resource = await prisma.archivedResource.findUnique({
      where: { id: resourceId },
    });

    if (!resource || resource.isDeleted) {
      throw new Error("RESOURCE_NOT_FOUND");
    }

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, resource.courseOfferingId);
    const isUploader = resource.uploaderId === userId;

    if (!isAdmin && !isInstructor && !isUploader) {
      throw new Error("FORBIDDEN: You do not have permission to edit this archive resource.");
    }

    // Official solution integrity: Students cannot toggle isOfficial = true
    if (data.isOfficial !== undefined && data.isOfficial !== resource.isOfficial) {
      if (!isAdmin && !isInstructor) {
        throw new Error("FORBIDDEN: Only instructors and administrators can change the official solution status.");
      }
    }

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.resourceType !== undefined) updateData.resourceType = data.resourceType;
    if (data.assessmentType !== undefined) updateData.assessmentType = data.assessmentType;
    if (data.examYear !== undefined) updateData.examYear = data.examYear ? Number(data.examYear) : null;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.isOfficial !== undefined && (isAdmin || isInstructor)) {
      updateData.isOfficial = !!data.isOfficial;
    }

    return prisma.archivedResource.update({
      where: { id: resourceId },
      data: updateData,
      include: {
        uploader: { select: { id: true, fullName: true, campusId: true } },
        moderatedBy: { select: { id: true, fullName: true } },
        courseOffering: { include: { course: true, class: true } },
      },
    });
  }

  /**
   * Delete an archive resource (soft-delete for instructors/uploaders, hard purge for Admin).
   */
  static async deleteResource(userId: string, resourceId: string, hardDelete: boolean = false) {
    const resource = await prisma.archivedResource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new Error("RESOURCE_NOT_FOUND");
    }

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, resource.courseOfferingId);
    const isUploader = resource.uploaderId === userId;

    if (!isAdmin && !isInstructor && !isUploader) {
      throw new Error("FORBIDDEN: You do not have permission to delete this archive resource.");
    }

    if (hardDelete) {
      if (!isAdmin) {
        throw new Error("FORBIDDEN: Only global administrators can permanently purge archive resources.");
      }
      StorageService.deleteFile(resource.fileKey);
      await prisma.archivedResource.delete({ where: { id: resourceId } });
      return { purged: true };
    }

    await prisma.archivedResource.update({
      where: { id: resourceId },
      data: { isDeleted: true },
    });

    return { softDeleted: true };
  }

  /**
   * Download archive resource: validates access, atomically increments counter, and returns path.
   */
  static async prepareDownload(resourceId: string, userId: string) {
    const resource = await prisma.archivedResource.findUnique({
      where: { id: resourceId },
      include: {
        courseOffering: true,
      },
    });

    if (!resource || resource.isDeleted) {
      throw new Error("RESOURCE_NOT_FOUND");
    }

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, resource.courseOfferingId);
    const isEnrolled = await this.isStudentEnrolled(userId, resource.courseOfferingId);
    const isUploader = resource.uploaderId === userId;

    // In an academic archive, approved items are open to authenticated university students,
    // but unapproved items require direct offering role or uploader ownership
    if (resource.status !== ModerationStatus.APPROVED) {
      if (!isAdmin && !isInstructor && !isUploader) {
        throw new Error("FORBIDDEN: This resource is not yet approved for download.");
      }
    } else {
      // For approved resources, any authenticated university student or instructor can access
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.isDeleted || !user.isActive) {
        throw new Error("FORBIDDEN: Inactive or unauthorized user.");
      }
    }

    // Atomically increment download counter
    await prisma.archivedResource.update({
      where: { id: resourceId },
      data: { downloads: { increment: 1 } },
    });

    const filePath = StorageService.getFilePath(resource.fileKey);

    return {
      filePath,
      fileName: resource.fileName,
      mimeType: resource.mimeType,
      fileSize: resource.fileSize,
    };
  }

  /**
   * Analytics and statistics for the archive.
   */
  static async getArchiveStats(userId: string, courseOfferingId?: string) {
    const where: any = { isDeleted: false, status: ModerationStatus.APPROVED };
    if (courseOfferingId) {
      where.courseOfferingId = courseOfferingId;
    }

    const [totalApproved, totalPending, totalOfficial, resources] = await Promise.all([
      prisma.archivedResource.count({ where }),
      prisma.archivedResource.count({
        where: {
          isDeleted: false,
          status: ModerationStatus.PENDING,
          ...(courseOfferingId ? { courseOfferingId } : {}),
        },
      }),
      prisma.archivedResource.count({
        where: {
          ...where,
          isOfficial: true,
        },
      }),
      prisma.archivedResource.findMany({
        where,
        select: {
          resourceType: true,
          assessmentType: true,
          downloads: true,
        },
      }),
    ]);

    const byResourceType: Record<string, number> = {};
    const byAssessmentType: Record<string, number> = {};
    let totalDownloads = 0;

    for (const r of resources) {
      byResourceType[r.resourceType] = (byResourceType[r.resourceType] || 0) + 1;
      if (r.assessmentType) {
        byAssessmentType[r.assessmentType] = (byAssessmentType[r.assessmentType] || 0) + 1;
      }
      totalDownloads += r.downloads;
    }

    const topDownloaded = await prisma.archivedResource.findMany({
      where,
      orderBy: { downloads: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        resourceType: true,
        assessmentType: true,
        examYear: true,
        isOfficial: true,
        downloads: true,
      },
    });

    return {
      totalApproved,
      totalPending,
      totalOfficial,
      totalDownloads,
      byResourceType,
      byAssessmentType,
      topDownloaded,
    };
  }
}
