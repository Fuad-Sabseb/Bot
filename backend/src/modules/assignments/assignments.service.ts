import { prisma } from "../../database/prisma";
import { AssignmentType, SubmissionLifecycleStatus, NotificationType } from "@prisma/client";
import { StorageService, StoredFileMeta } from "../../services/storage.service";
import { ReminderService } from "../../services/reminder.service";
import { sendTelegramNotification } from "../telegram/bot";

export interface CreateAssignmentInput {
  courseOfferingId: string;
  title: string;
  description: string;
  instructions?: string;
  type?: AssignmentType;
  minGroupSize?: number;
  maxGroupSize?: number;
  maxMarks?: number;
  dueDate: Date;
  cutoffDate?: Date;
  allowResubmission?: boolean;
}

export interface UpdateAssignmentInput {
  title?: string;
  description?: string;
  instructions?: string;
  maxMarks?: number;
  dueDate?: Date;
  cutoffDate?: Date;
  allowResubmission?: boolean;
  minGroupSize?: number;
  maxGroupSize?: number;
}

export class AssignmentsService {
  /**
   * Helper: Check if a user has permission to manage an assignment for a course offering.
   * Authorized: Global Admin, Course Instructor/Lead Instructor on the offering, or Class Rep of the class.
   */
  static async canUserManageOffering(userId: string, courseOfferingId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        globalRoles: true,
        courseRoles: {
          where: { courseOfferingId },
        },
      },
    });

    if (!user) return false;

    // 1. Global Admin
    if (user.globalRoles.some((r) => r.role === "ADMIN")) return true;

    // 2. Instructor on offering
    if (user.courseRoles.some((r) => r.role === "LEAD_INSTRUCTOR" || r.role === "INSTRUCTOR")) {
      return true;
    }

    // 3. Class Rep of the class cohort for this course offering
    const offering = await prisma.courseOffering.findUnique({
      where: { id: courseOfferingId },
      select: { classId: true },
    });

    if (offering) {
      const classRep = await prisma.userClassRole.findFirst({
        where: {
          userId,
          classId: offering.classId,
          role: "CLASS_REP",
        },
      });
      if (classRep) return true;
    }

    return false;
  }

  /**
   * Helper: Check if user is an instructor or admin who can grade submissions.
   * Note: Class Reps CANNOT grade.
   */
  static async canUserGradeOffering(userId: string, courseOfferingId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        globalRoles: true,
        courseRoles: {
          where: { courseOfferingId },
        },
      },
    });

    if (!user) return false;
    if (user.globalRoles.some((r) => r.role === "ADMIN")) return true;
    return user.courseRoles.some(
      (r) => r.role === "LEAD_INSTRUCTOR" || r.role === "INSTRUCTOR" || r.role === "TEACHING_ASSISTANT"
    );
  }

  /**
   * Helper: Check if student is actively enrolled in the course offering.
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
   * Create an assignment with optional file attachments.
   */
  static async createAssignment(
    creatorId: string,
    data: CreateAssignmentInput,
    attachmentFiles?: { buffer: Buffer; originalname: string; mimetype: string }[]
  ) {
    const isAuthorized = await this.canUserManageOffering(creatorId, data.courseOfferingId);
    if (!isAuthorized) {
      throw new Error("FORBIDDEN: You do not have permission to create assignments for this course offering.");
    }

    if (data.cutoffDate && data.cutoffDate < data.dueDate) {
      throw new Error("INVALID_CUTOFF_DATE: Cutoff date cannot be earlier than due date.");
    }

    const assignment = await prisma.assignment.create({
      data: {
        courseOfferingId: data.courseOfferingId,
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        assignedById: creatorId,
        type: data.type || AssignmentType.INDIVIDUAL,
        minGroupSize: data.minGroupSize || 1,
        maxGroupSize: data.maxGroupSize || 5,
        maxMarks: data.maxMarks,
        dueDate: data.dueDate,
        cutoffDate: data.cutoffDate,
        allowResubmission: data.allowResubmission !== undefined ? data.allowResubmission : true,
      },
    });

    // Save attachments if provided
    if (attachmentFiles && attachmentFiles.length > 0) {
      for (const file of attachmentFiles) {
        const stored = StorageService.saveFile(
          file.buffer,
          "attachments",
          file.originalname,
          file.mimetype
        );

        await prisma.assignmentAttachment.create({
          data: {
            assignmentId: assignment.id,
            fileName: stored.originalName,
            fileKey: stored.fileKey,
            fileUrl: `/api/v1/assignments/files/${stored.fileKey}`,
            fileSize: stored.fileSize,
            mimeType: stored.mimeType,
          },
        });
      }
    }

    // Schedule automated reminders
    await ReminderService.scheduleAssignmentReminders(assignment.id);

    // Notify enrolled students of the new assignment
    const enrollments = await prisma.enrollment.findMany({
      where: { courseOfferingId: data.courseOfferingId, status: "ACTIVE" },
      select: { userId: true },
    });

    for (const enrollment of enrollments) {
      await prisma.notification.create({
        data: {
          userId: enrollment.userId,
          type: NotificationType.ASSIGNMENT_NEW,
          title: `New Assignment: ${assignment.title}`,
          message: `A new assignment has been posted: "${assignment.title}". Due date: ${assignment.dueDate.toLocaleString()}`,
          link: `/assignments/${assignment.id}`,
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: enrollment.userId },
        include: { notificationPref: true },
      });
      if (user?.telegramChatId && (user.notificationPref?.channelTelegram ?? true)) {
        await sendTelegramNotification(
          user.telegramChatId,
          `📝 *New Assignment Posted: ${assignment.title}*\n\n` +
            `Due Date: *${assignment.dueDate.toUTCString()}*\n` +
            `Type: ${assignment.type}\n\n` +
            `Access the academic portal to view specifications and attachments.`
        );
      }
    }

    return this.getAssignmentById(assignment.id, creatorId);
  }

  /**
   * Update assignment details, instructions, or deadlines.
   */
  static async updateAssignment(assignmentId: string, editorId: string, data: UpdateAssignmentInput) {
    const existing = await prisma.assignment.findUnique({
      where: { id: assignmentId },
    });

    if (!existing) {
      throw new Error("ASSIGNMENT_NOT_FOUND");
    }

    const isAuthorized = await this.canUserManageOffering(editorId, existing.courseOfferingId);
    if (!isAuthorized) {
      throw new Error("FORBIDDEN: You do not have permission to edit this assignment.");
    }

    const newDueDate = data.dueDate || existing.dueDate;
    const newCutoffDate = data.cutoffDate !== undefined ? data.cutoffDate : existing.cutoffDate;

    if (newCutoffDate && newCutoffDate < newDueDate) {
      throw new Error("INVALID_CUTOFF_DATE: Cutoff date cannot be earlier than due date.");
    }

    const updated = await prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        maxMarks: data.maxMarks,
        dueDate: data.dueDate,
        cutoffDate: data.cutoffDate,
        allowResubmission: data.allowResubmission,
        minGroupSize: data.minGroupSize,
        maxGroupSize: data.maxGroupSize,
      },
    });

    // If deadline was changed, reschedule reminders & notify enrolled students
    if (data.dueDate && data.dueDate.getTime() !== existing.dueDate.getTime()) {
      await ReminderService.scheduleAssignmentReminders(assignmentId);

      const enrollments = await prisma.enrollment.findMany({
        where: { courseOfferingId: existing.courseOfferingId, status: "ACTIVE" },
        select: { userId: true },
      });

      for (const e of enrollments) {
        await prisma.notification.create({
          data: {
            userId: e.userId,
            type: NotificationType.DEADLINE_CHANGED,
            title: `Deadline Extended: ${updated.title}`,
            message: `The deadline for "${updated.title}" has been updated to ${updated.dueDate.toLocaleString()}.`,
            link: `/assignments/${assignmentId}`,
          },
        });

        const user = await prisma.user.findUnique({
          where: { id: e.userId },
          include: { notificationPref: true },
        });
        if (user?.telegramChatId && (user.notificationPref?.channelTelegram ?? true)) {
          await sendTelegramNotification(
            user.telegramChatId,
            `⏰ *Deadline Extended: ${updated.title}*\n\n` +
              `New Due Date: *${updated.dueDate.toUTCString()}*\n\n` +
              `Please ensure your submission is finalized before the updated cutoff.`
          );
        }
      }
    }

    return this.getAssignmentById(assignmentId, editorId);
  }

  /**
   * Archive an assignment.
   */
  static async archiveAssignment(assignmentId: string, userId: string) {
    const existing = await prisma.assignment.findUnique({
      where: { id: assignmentId },
    });

    if (!existing) {
      throw new Error("ASSIGNMENT_NOT_FOUND");
    }

    const isAuthorized = await this.canUserManageOffering(userId, existing.courseOfferingId);
    if (!isAuthorized) {
      throw new Error("FORBIDDEN: You do not have permission to archive this assignment.");
    }

    return prisma.assignment.update({
      where: { id: assignmentId },
      data: { isArchived: true },
    });
  }

  /**
   * Retrieve assignment details with attachments and course info.
   */
  static async getAssignmentById(assignmentId: string, requesterUserId?: string) {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        attachments: true,
        assignedBy: {
          select: { id: true, fullName: true, email: true },
        },
        courseOffering: {
          include: {
            course: true,
            class: true,
            semester: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new Error("ASSIGNMENT_NOT_FOUND");
    }

    return assignment;
  }

  /**
   * List assignments for a course offering.
   */
  static async listAssignmentsForOffering(courseOfferingId: string, requesterUserId: string) {
    return prisma.assignment.findMany({
      where: {
        courseOfferingId,
        isArchived: false,
      },
      include: {
        attachments: true,
        assignedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { dueDate: "asc" },
    });
  }

  /**
   * Student Assignment Dashboard: returns all assignments categorized with submission status,
   * countdowns, and grades.
   */
  static async getStudentDashboard(userId: string) {
    // 1. Find all active course offerings for student
    const enrollments = await prisma.enrollment.findMany({
      where: { userId, status: "ACTIVE" },
      include: {
        courseOffering: {
          include: {
            course: true,
            semester: true,
            class: true,
          },
        },
      },
    });

    const offeringIds = enrollments.map((e) => e.courseOfferingId);
    if (offeringIds.length === 0) {
      return {
        summary: { total: 0, upcoming: 0, submitted: 0, overdue: 0, graded: 0 },
        categories: { upcoming: [], submitted: [], overdue: [], graded: [] },
      };
    }

    // 2. Fetch all non-archived assignments for enrolled offerings
    const assignments = await prisma.assignment.findMany({
      where: {
        courseOfferingId: { in: offeringIds },
        isArchived: false,
      },
      include: {
        attachments: true,
        courseOffering: {
          include: {
            course: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    const now = new Date();
    const categories: {
      upcoming: any[];
      submitted: any[];
      overdue: any[];
      graded: any[];
    } = {
      upcoming: [],
      submitted: [],
      overdue: [],
      graded: [],
    };

    for (const assignment of assignments) {
      let currentSubmission: any = null;
      let userGroup: any = null;

      if (assignment.type === AssignmentType.INDIVIDUAL) {
        currentSubmission = await prisma.assignmentSubmission.findFirst({
          where: {
            assignmentId: assignment.id,
            studentId: userId,
            isCurrentVersion: true,
          },
          include: {
            gradedBy: { select: { fullName: true } },
          },
        });
      } else {
        // Group assignment: find student's group
        const membership = await prisma.assignmentGroupMember.findFirst({
          where: { assignmentId: assignment.id, userId },
          include: {
            group: {
              include: {
                members: {
                  include: { user: { select: { id: true, fullName: true, campusId: true } } },
                },
              },
            },
          },
        });

        if (membership) {
          userGroup = membership.group;
          currentSubmission = await prisma.assignmentSubmission.findFirst({
            where: {
              assignmentId: assignment.id,
              groupId: membership.groupId,
              isCurrentVersion: true,
            },
            include: {
              gradedBy: { select: { fullName: true } },
            },
          });
        }
      }

      // Calculate deadline countdown
      const diffMs = assignment.dueDate.getTime() - now.getTime();
      let timeRemainingText = "";
      if (diffMs > 0) {
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        timeRemainingText = days > 0 ? `${days}d ${hours}h remaining` : `${hours}h remaining`;
      } else {
        const overdueDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
        timeRemainingText = overdueDays > 0 ? `Overdue by ${overdueDays}d` : `Overdue`;
      }

      const isCutoffPassed = assignment.cutoffDate
        ? now > assignment.cutoffDate
        : now > assignment.dueDate;

      let status = "UPCOMING";
      if (currentSubmission) {
        if (currentSubmission.grade !== null) {
          status = "GRADED";
        } else if (currentSubmission.submittedAt > assignment.dueDate) {
          status = "LATE_SUBMITTED";
        } else {
          status = "SUBMITTED";
        }
      } else {
        if (isCutoffPassed) {
          status = "OVERDUE";
        } else {
          status = "UPCOMING";
        }
      }

      const item = {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        courseName: assignment.courseOffering.course.title,
        courseCode: assignment.courseOffering.course.code,
        type: assignment.type,
        dueDate: assignment.dueDate,
        cutoffDate: assignment.cutoffDate,
        maxMarks: assignment.maxMarks,
        allowResubmission: assignment.allowResubmission,
        status,
        timeRemainingMs: diffMs,
        timeRemainingText,
        submission: currentSubmission
          ? {
              id: currentSubmission.id,
              fileName: currentSubmission.fileName,
              fileSize: currentSubmission.fileSize,
              version: currentSubmission.version,
              submittedAt: currentSubmission.submittedAt,
              status: currentSubmission.status,
              grade: currentSubmission.grade,
              feedback: currentSubmission.feedback,
              gradedBy: currentSubmission.gradedBy?.fullName || null,
              gradedAt: currentSubmission.gradedAt,
            }
          : null,
        group: userGroup
          ? {
              id: userGroup.id,
              name: userGroup.name,
              isLocked: userGroup.isLocked,
              memberCount: userGroup.members.length,
            }
          : null,
      };

      if (status === "GRADED") {
        categories.graded.push(item);
      } else if (status === "SUBMITTED" || status === "LATE_SUBMITTED") {
        categories.submitted.push(item);
      } else if (status === "OVERDUE") {
        categories.overdue.push(item);
      } else {
        categories.upcoming.push(item);
      }
    }

    return {
      summary: {
        total: assignments.length,
        upcoming: categories.upcoming.length,
        submitted: categories.submitted.length,
        overdue: categories.overdue.length,
        graded: categories.graded.length,
      },
      categories,
    };
  }

  /**
   * Group Management: Create an assignment group.
   */
  static async createGroup(assignmentId: string, userId: string, name: string) {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new Error("ASSIGNMENT_NOT_FOUND");
    }

    if (assignment.type !== AssignmentType.GROUP) {
      throw new Error("INVALID_OPERATION: Groups are only allowed for GROUP assignments.");
    }

    const isEnrolled = await this.isStudentEnrolled(userId, assignment.courseOfferingId);
    if (!isEnrolled) {
      throw new Error("FORBIDDEN: You must be enrolled in the course offering to join or create groups.");
    }

    // Check if user is already in a group for this assignment
    const existingMembership = await prisma.assignmentGroupMember.findFirst({
      where: { assignmentId, userId },
    });

    if (existingMembership) {
      throw new Error("ALREADY_IN_GROUP: You are already a member of an assignment group for this assignment.");
    }

    // Check unique group name for this assignment
    const existingName = await prisma.assignmentGroup.findUnique({
      where: {
        assignmentId_name: {
          assignmentId,
          name: name.trim(),
        },
      },
    });

    if (existingName) {
      throw new Error("GROUP_NAME_TAKEN: A group with this name already exists for this assignment.");
    }

    return prisma.$transaction(async (tx) => {
      const group = await tx.assignmentGroup.create({
        data: {
          assignmentId,
          name: name.trim(),
          createdById: userId,
        },
      });

      await tx.assignmentGroupMember.create({
        data: {
          assignmentId,
          groupId: group.id,
          userId,
          isLeader: true,
        },
      });

      return tx.assignmentGroup.findUnique({
        where: { id: group.id },
        include: {
          members: {
            include: { user: { select: { id: true, fullName: true, campusId: true } } },
          },
        },
      });
    });
  }

  /**
   * Group Management: Join an existing group.
   */
  static async joinGroup(assignmentId: string, groupId: string, userId: string) {
    const group = await prisma.assignmentGroup.findUnique({
      where: { id: groupId },
      include: {
        assignment: true,
        members: true,
      },
    });

    if (!group || group.assignmentId !== assignmentId) {
      throw new Error("GROUP_NOT_FOUND");
    }

    if (group.isLocked) {
      throw new Error("GROUP_LOCKED: Group membership is locked because a submission has already been made.");
    }

    const isEnrolled = await this.isStudentEnrolled(userId, group.assignment.courseOfferingId);
    if (!isEnrolled) {
      throw new Error("FORBIDDEN: You must be enrolled in the course offering to join groups.");
    }

    if (group.members.length >= group.assignment.maxGroupSize) {
      throw new Error(`GROUP_FULL: Group has reached maximum capacity of ${group.assignment.maxGroupSize} members.`);
    }

    const existingMembership = await prisma.assignmentGroupMember.findFirst({
      where: { assignmentId, userId },
    });

    if (existingMembership) {
      throw new Error("ALREADY_IN_GROUP: You are already in a group for this assignment.");
    }

    return prisma.assignmentGroupMember.create({
      data: {
        assignmentId,
        groupId,
        userId,
        isLeader: false,
      },
    });
  }

  /**
   * Group Management: Leave a group.
   */
  static async leaveGroup(assignmentId: string, groupId: string, userId: string) {
    const group = await prisma.assignmentGroup.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group || group.assignmentId !== assignmentId) {
      throw new Error("GROUP_NOT_FOUND");
    }

    if (group.isLocked) {
      throw new Error("GROUP_LOCKED: Cannot leave group after submission has been made.");
    }

    const membership = group.members.find((m) => m.userId === userId);
    if (!membership) {
      throw new Error("NOT_A_MEMBER: You are not a member of this group.");
    }

    return prisma.$transaction(async (tx) => {
      await tx.assignmentGroupMember.delete({
        where: { id: membership.id },
      });

      const remainingMembers = group.members.filter((m) => m.userId !== userId);
      if (remainingMembers.length === 0) {
        // Delete empty group
        await tx.assignmentGroup.delete({ where: { id: groupId } });
        return { left: true, groupDeleted: true };
      } else if (membership.isLeader) {
        // Appoint next member as leader
        await tx.assignmentGroupMember.update({
          where: { id: remainingMembers[0].id },
          data: { isLeader: true },
        });
      }

      return { left: true, groupDeleted: false };
    });
  }

  /**
   * Group Management: List all groups for an assignment.
   */
  static async listGroups(assignmentId: string) {
    return prisma.assignmentGroup.findMany({
      where: { assignmentId },
      include: {
        members: {
          include: {
            user: { select: { id: true, fullName: true, campusId: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Submissions Engine: Submit or resubmit an assignment file.
   */
  static async submitAssignment(
    assignmentId: string,
    userId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string
  ) {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { courseOffering: true },
    });

    if (!assignment || assignment.isArchived) {
      throw new Error("ASSIGNMENT_NOT_FOUND");
    }

    const isEnrolled = await this.isStudentEnrolled(userId, assignment.courseOfferingId);
    if (!isEnrolled) {
      throw new Error("FORBIDDEN: You must be enrolled in the course offering to submit assignments.");
    }

    const now = new Date();
    const effectiveCutoff = assignment.cutoffDate || assignment.dueDate;
    if (now > effectiveCutoff) {
      throw new Error("DEADLINE_PASSED: The submission deadline and cutoff window have closed.");
    }

    const isLate = now > assignment.dueDate;
    const initialStatus = isLate
      ? SubmissionLifecycleStatus.LATE_SUBMITTED
      : SubmissionLifecycleStatus.SUBMITTED;

    if (assignment.type === AssignmentType.INDIVIDUAL) {
      // Check existing submission
      const existingSubmission = await prisma.assignmentSubmission.findFirst({
        where: {
          assignmentId,
          studentId: userId,
          isCurrentVersion: true,
        },
      });

      if (existingSubmission && !assignment.allowResubmission) {
        throw new Error("RESUBMISSION_NOT_ALLOWED: Resubmission is disabled for this assignment.");
      }

      const version = existingSubmission ? existingSubmission.version + 1 : 1;

      // Save file safely with collision-free naming and SHA-256
      const storedMeta = StorageService.saveFile(
        fileBuffer,
        "assignments/individual",
        originalName,
        mimeType
      );

      // Execute transactionally
      const submission = await prisma.$transaction(async (tx) => {
        if (existingSubmission) {
          await tx.assignmentSubmission.update({
            where: { id: existingSubmission.id },
            data: { isCurrentVersion: false },
          });
        }

        return tx.assignmentSubmission.create({
          data: {
            assignmentId,
            studentId: userId,
            groupId: null,
            version,
            isCurrentVersion: true,
            fileKey: storedMeta.fileKey,
            fileUrl: `/api/v1/assignments/files/${storedMeta.fileKey}`,
            fileName: storedMeta.originalName,
            fileSize: storedMeta.fileSize,
            mimeType: storedMeta.mimeType,
            status: initialStatus,
            submittedAt: now,
          },
        });
      });

      // Cancel pending reminders for this student
      await ReminderService.cancelStudentReminders(assignmentId, userId);

      return submission;
    } else {
      // GROUP ASSIGNMENT
      const membership = await prisma.assignmentGroupMember.findFirst({
        where: { assignmentId, userId },
        include: {
          group: {
            include: { members: true },
          },
        },
      });

      if (!membership) {
        throw new Error("STUDENT_NOT_IN_GROUP: You must join or create a group before submitting a group assignment.");
      }

      const group = membership.group;
      if (group.members.length < assignment.minGroupSize) {
        throw new Error(
          `MINIMUM_GROUP_SIZE_NOT_MET: Group must have at least ${assignment.minGroupSize} members to submit (current: ${group.members.length}).`
        );
      }

      const existingSubmission = await prisma.assignmentSubmission.findFirst({
        where: {
          assignmentId,
          groupId: group.id,
          isCurrentVersion: true,
        },
      });

      if (existingSubmission && !assignment.allowResubmission) {
        throw new Error("RESUBMISSION_NOT_ALLOWED: Resubmission is disabled for this assignment.");
      }

      const version = existingSubmission ? existingSubmission.version + 1 : 1;

      // Save file
      const storedMeta = StorageService.saveFile(
        fileBuffer,
        "assignments/group",
        originalName,
        mimeType
      );

      // Execute transactionally: lock group and record submission
      const submission = await prisma.$transaction(async (tx) => {
        if (existingSubmission) {
          await tx.assignmentSubmission.update({
            where: { id: existingSubmission.id },
            data: { isCurrentVersion: false },
          });
        }

        // Lock group
        await tx.assignmentGroup.update({
          where: { id: group.id },
          data: { isLocked: true },
        });

        return tx.assignmentSubmission.create({
          data: {
            assignmentId,
            studentId: null,
            groupId: group.id,
            version,
            isCurrentVersion: true,
            fileKey: storedMeta.fileKey,
            fileUrl: `/api/v1/assignments/files/${storedMeta.fileKey}`,
            fileName: storedMeta.originalName,
            fileSize: storedMeta.fileSize,
            mimeType: storedMeta.mimeType,
            status: initialStatus,
            submittedAt: now,
          },
        });
      });

      // Cancel pending reminders for all group members
      await ReminderService.cancelGroupReminders(assignmentId, group.id);

      return submission;
    }
  }

  /**
   * Submission History: Get all versions of a student's (or their group's) submissions.
   */
  static async getMySubmissions(assignmentId: string, userId: string) {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new Error("ASSIGNMENT_NOT_FOUND");
    }

    if (assignment.type === AssignmentType.INDIVIDUAL) {
      return prisma.assignmentSubmission.findMany({
        where: { assignmentId, studentId: userId },
        orderBy: { version: "desc" },
        include: {
          gradedBy: { select: { fullName: true } },
        },
      });
    } else {
      const member = await prisma.assignmentGroupMember.findFirst({
        where: { assignmentId, userId },
      });

      if (!member) {
        return [];
      }

      return prisma.assignmentSubmission.findMany({
        where: { assignmentId, groupId: member.groupId },
        orderBy: { version: "desc" },
        include: {
          gradedBy: { select: { fullName: true } },
          group: {
            include: {
              members: {
                include: { user: { select: { id: true, fullName: true, campusId: true } } },
              },
            },
          },
        },
      });
    }
  }

  /**
   * Teacher/Admin: View all current submissions for an assignment.
   */
  static async getAllSubmissions(assignmentId: string, requesterUserId: string) {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { courseOffering: true },
    });

    if (!assignment) {
      throw new Error("ASSIGNMENT_NOT_FOUND");
    }

    const isAuthorized = await this.canUserGradeOffering(requesterUserId, assignment.courseOfferingId);
    if (!isAuthorized) {
      throw new Error("FORBIDDEN: You do not have permission to view submissions for this assignment.");
    }

    return prisma.assignmentSubmission.findMany({
      where: { assignmentId, isCurrentVersion: true },
      include: {
        student: { select: { id: true, fullName: true, campusId: true, email: true } },
        group: {
          include: {
            members: {
              include: { user: { select: { id: true, fullName: true, campusId: true } } },
            },
          },
        },
        gradedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { submittedAt: "asc" },
    });
  }

  /**
   * Teacher/Admin: Grade a submission with score, feedback, and student notification.
   */
  static async gradeSubmission(
    submissionId: string,
    graderUserId: string,
    grade: number,
    feedback?: string
  ) {
    const submission = await prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: { courseOffering: true },
        },
        group: {
          include: { members: true },
        },
      },
    });

    if (!submission) {
      throw new Error("SUBMISSION_NOT_FOUND");
    }

    const isAuthorized = await this.canUserGradeOffering(
      graderUserId,
      submission.assignment.courseOfferingId
    );
    if (!isAuthorized) {
      throw new Error("FORBIDDEN: You do not have permission to grade this submission.");
    }

    if (grade < 0) {
      throw new Error("INVALID_GRADE: Grade cannot be negative.");
    }

    if (submission.assignment.maxMarks !== null && grade > submission.assignment.maxMarks) {
      throw new Error(
        `INVALID_GRADE: Grade (${grade}) exceeds maximum marks (${submission.assignment.maxMarks}).`
      );
    }

    const updated = await prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        grade,
        feedback,
        gradedById: graderUserId,
        gradedAt: new Date(),
        status: SubmissionLifecycleStatus.GRADED,
      },
      include: {
        student: { select: { id: true, fullName: true, campusId: true } },
        gradedBy: { select: { id: true, fullName: true } },
      },
    });

    // Notify student or all group members
    const recipientUserIds: string[] = [];
    if (submission.studentId) {
      recipientUserIds.push(submission.studentId);
    } else if (submission.group) {
      recipientUserIds.push(...submission.group.members.map((m) => m.userId));
    }

    for (const recipientId of recipientUserIds) {
      await prisma.notification.create({
        data: {
          userId: recipientId,
          type: NotificationType.GRADE_RELEASED,
          title: `Grade Released: ${submission.assignment.title}`,
          message: `Your submission for "${submission.assignment.title}" has been graded: ${grade}/${
            submission.assignment.maxMarks || "N/A"
          }. ${feedback ? `Feedback: "${feedback}"` : ""}`,
          link: `/assignments/${submission.assignmentId}`,
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: recipientId },
        include: { notificationPref: true },
      });
      if (user?.telegramChatId && (user.notificationPref?.channelTelegram ?? true)) {
        await sendTelegramNotification(
          user.telegramChatId,
          `📊 *Grade Released: ${submission.assignment.title}*\n\n` +
            `Your score: *${grade}/${submission.assignment.maxMarks ?? "N/A"}*\n` +
            (feedback ? `Feedback: _"${feedback}"_\n` : "") +
            `View complete grading details on the academic portal.`
        );
      }
    }

    return updated;
  }

  /**
   * File Authorization Check: Verify user has permission to download a file.
   */
  static async verifyFileAccess(fileKey: string, requesterUserId: string): Promise<boolean> {
    // 1. Is it an attachment?
    const attachment = await prisma.assignmentAttachment.findFirst({
      where: { fileKey },
      include: { assignment: true },
    });

    if (attachment) {
      // Check enrollment or teacher/admin
      const isEnrolled = await this.isStudentEnrolled(
        requesterUserId,
        attachment.assignment.courseOfferingId
      );
      if (isEnrolled) return true;

      return this.canUserManageOffering(requesterUserId, attachment.assignment.courseOfferingId);
    }

    // 2. Is it a submission?
    const submission = await prisma.assignmentSubmission.findFirst({
      where: { fileKey },
      include: {
        assignment: true,
        group: { include: { members: true } },
      },
    });

    if (submission) {
      // Instructor or Admin
      const canGrade = await this.canUserGradeOffering(
        requesterUserId,
        submission.assignment.courseOfferingId
      );
      if (canGrade) return true;

      // Student owner
      if (submission.studentId === requesterUserId) return true;

      // Member of group
      if (submission.group && submission.group.members.some((m) => m.userId === requesterUserId)) {
        return true;
      }
    }

    return false;
  }
}
