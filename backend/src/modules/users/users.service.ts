import { prisma } from "../../database/prisma";
import { hashPassword, verifyPassword } from "../../utils/crypto";
import { GlobalRole, ClassRole, CourseRole } from "@prisma/client";
import crypto from "crypto";

// Ephemeral in-memory OTP store for Telegram account linking (15-min TTL)
interface TelegramLinkCode {
  userId: string;
  expiresAt: number;
}
const telegramLinkCodes = new Map<string, TelegramLinkCode>();

export class UsersService {
  /**
   * Get user profile with all associated scopes and enrollments.
   */
  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId, isDeleted: false },
      include: {
        primaryClass: {
          include: { academicYear: true },
        },
        globalRoles: true,
        classRoles: {
          include: { class: true },
        },
        courseRoles: {
          include: {
            courseOffering: {
              include: { course: true, semester: true },
            },
          },
        },
        enrollments: {
          where: { status: "ACTIVE" },
          include: {
            courseOffering: {
              include: { course: true, semester: true, class: true },
            },
          },
        },
      },
    });

    if (!user) {
      const error: any = new Error("User profile not found.");
      error.statusCode = 404;
      error.code = "USER_NOT_FOUND";
      throw error;
    }

    return {
      id: user.id,
      campusId: user.campusId,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      isVerified: user.isVerified,
      telegramChatId: user.telegramChatId ? user.telegramChatId.toString() : null,
      telegramUsername: user.telegramUsername,
      primaryClass: user.primaryClass,
      globalRoles: user.globalRoles.map((r) => r.role),
      classRoles: user.classRoles.map((r) => ({
        classId: r.classId,
        className: r.class.name,
        classCode: r.class.code,
        role: r.role,
      })),
      courseRoles: user.courseRoles.map((r) => ({
        offeringId: r.courseOfferingId,
        courseCode: r.courseOffering.course.code,
        courseTitle: r.courseOffering.course.title,
        role: r.role,
      })),
      enrollments: user.enrollments.map((e) => ({
        offeringId: e.courseOfferingId,
        courseCode: e.courseOffering.course.code,
        courseTitle: e.courseOffering.course.title,
        semesterName: e.courseOffering.semester.name,
        className: e.courseOffering.class.name,
        enrolledAt: e.enrolledAt,
      })),
      createdAt: user.createdAt,
    };
  }

  /**
   * Update personal profile (name, avatar, change password).
   */
  static async updateProfile(
    userId: string,
    data: {
      fullName?: string;
      email?: string;
      avatarUrl?: string;
      currentPassword?: string;
      newPassword?: string;
    }
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("USER_NOT_FOUND");

    const updateData: any = {};

    if (data.fullName) updateData.fullName = data.fullName.trim();
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;

    if (data.email) {
      const email = data.email.trim().toLowerCase();
      if (email !== user.email) {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          const error: any = new Error("Email is already in use by another account.");
          error.statusCode = 409;
          error.code = "EMAIL_ALREADY_USED";
          throw error;
        }
        updateData.email = email;
      }
    }

    if (data.newPassword) {
      if (user.passwordHash) {
        if (!data.currentPassword) {
          const error: any = new Error("Current password is required to set a new password.");
          error.statusCode = 400;
          error.code = "CURRENT_PASSWORD_REQUIRED";
          throw error;
        }
        const matches = await verifyPassword(data.currentPassword, user.passwordHash);
        if (!matches) {
          const error: any = new Error("Current password verification failed.");
          error.statusCode = 401;
          error.code = "INVALID_CURRENT_PASSWORD";
          throw error;
        }
      }
      updateData.passwordHash = await hashPassword(data.newPassword);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        campusId: true,
      },
    });

    return updated;
  }

  /**
   * Generate 6-digit OTP token for linking Telegram account.
   */
  static generateTelegramLinkToken(userId: string) {
    // Generate secure 6-digit numeric OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

    telegramLinkCodes.set(otp, { userId, expiresAt });

    return {
      otp,
      expiresAt: new Date(expiresAt).toISOString(),
      deepLinkInstruction: `Send "/link ${otp}" to the class Telegram bot.`,
    };
  }

  /**
   * Verify OTP and link Telegram Chat ID and username to the user account.
   */
  static async verifyTelegramLinkToken(otp: string, telegramChatId: number | bigint, telegramUsername?: string) {
    const entry = telegramLinkCodes.get(otp.trim());
    const now = Date.now();

    if (!entry || now > entry.expiresAt) {
      telegramLinkCodes.delete(otp.trim());
      const error: any = new Error("Invalid or expired Telegram linking token.");
      error.statusCode = 400;
      error.code = "INVALID_LINK_TOKEN";
      throw error;
    }

    const bigIntChatId = BigInt(telegramChatId);

    // Assert that no other active account is linked to this Telegram Chat ID
    const existing = await prisma.user.findFirst({
      where: {
        telegramChatId: bigIntChatId,
        id: { not: entry.userId },
        isDeleted: false,
      },
    });

    if (existing) {
      const error: any = new Error("This Telegram account is already linked to another university account.");
      error.statusCode = 409;
      error.code = "TELEGRAM_ALREADY_LINKED";
      throw error;
    }

    const updatedUser = await prisma.user.update({
      where: { id: entry.userId },
      data: {
        telegramChatId: bigIntChatId,
        telegramUsername: telegramUsername || null,
        isVerified: true,
      },
      select: {
        id: true,
        fullName: true,
        campusId: true,
        telegramChatId: true,
        telegramUsername: true,
      },
    });

    telegramLinkCodes.delete(otp.trim());

    return {
      success: true,
      user: {
        ...updatedUser,
        telegramChatId: updatedUser.telegramChatId?.toString(),
      },
    };
  }

  /**
   * Administrator: List users with filters, search, and pagination.
   */
  static async adminListUsers(query: {
    search?: string;
    role?: string;
    classId?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { isDeleted: false };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.classId) {
      where.primaryClassId = query.classId;
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { fullName: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        { campusId: { contains: term, mode: "insensitive" } },
        { telegramUsername: { contains: term, mode: "insensitive" } },
      ];
    }

    if (query.role) {
      const roleUpper = query.role.toUpperCase();
      if (["ADMIN", "USER"].includes(roleUpper)) {
        where.globalRoles = { some: { role: roleUpper as GlobalRole } };
      } else if (["CLASS_REP", "STUDENT"].includes(roleUpper)) {
        where.classRoles = { some: { role: roleUpper as ClassRole } };
      } else if (["LEAD_INSTRUCTOR", "INSTRUCTOR", "TEACHING_ASSISTANT"].includes(roleUpper)) {
        where.courseRoles = { some: { role: roleUpper as CourseRole } };
      }
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          primaryClass: true,
          globalRoles: true,
          classRoles: true,
          courseRoles: true,
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      users: users.map((u) => ({
        id: u.id,
        campusId: u.campusId,
        fullName: u.fullName,
        email: u.email,
        isActive: u.isActive,
        isVerified: u.isVerified,
        telegramChatId: u.telegramChatId ? u.telegramChatId.toString() : null,
        telegramUsername: u.telegramUsername,
        primaryClass: u.primaryClass?.name || null,
        globalRoles: u.globalRoles.map((r) => r.role),
        classRoles: u.classRoles.map((r) => r.role),
        courseRoles: u.courseRoles.map((r) => r.role),
        createdAt: u.createdAt,
      })),
    };
  }

  /**
   * Administrator: Provision a verified Teacher account.
   */
  static async adminProvisionTeacher(data: {
    fullName: string;
    email: string;
    password?: string;
  }) {
    const email = data.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const error: any = new Error("An account with this email already exists.");
      error.statusCode = 409;
      error.code = "EMAIL_ALREADY_EXISTS";
      throw error;
    }

    const defaultPassword = data.password || crypto.randomBytes(6).toString("hex") + "A1!";
    const passwordHash = await hashPassword(defaultPassword);

    const user = await prisma.user.create({
      data: {
        fullName: data.fullName.trim(),
        email,
        passwordHash,
        isActive: true,
        isVerified: true,
        globalRoles: {
          create: { role: "USER" },
        },
      },
    });

    return {
      teacher: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
      },
      provisionalPassword: defaultPassword,
    };
  }

  /**
   * Administrator: Update user active status (suspend or reactivate).
   */
  static async adminUpdateUserStatus(userId: string, isActive: boolean) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, fullName: true, campusId: true, isActive: true },
    });

    // If deactivating, also revoke active sessions immediately
    if (!isActive) {
      await prisma.session.updateMany({
        where: { userId },
        data: { isRevoked: true },
      });
      await prisma.refreshToken.updateMany({
        where: { session: { userId } },
        data: { isRevoked: true },
      });
    }

    return user;
  }

  /**
   * Administrator: Assign or remove global role.
   */
  static async adminManageGlobalRole(userId: string, role: GlobalRole, assign: boolean) {
    if (assign) {
      return prisma.userGlobalRole.upsert({
        where: { userId_role: { userId, role } },
        update: {},
        create: { userId, role },
      });
    } else {
      return prisma.userGlobalRole.deleteMany({
        where: { userId, role },
      });
    }
  }

  /**
   * Administrator: Assign or remove class role (e.g. CLASS_REP).
   */
  static async adminManageClassRole(userId: string, classId: string, role: ClassRole, assign: boolean) {
    if (assign) {
      return prisma.userClassRole.upsert({
        where: { userId_classId_role: { userId, classId, role } },
        update: {},
        create: { userId, classId, role },
      });
    } else {
      return prisma.userClassRole.deleteMany({
        where: { userId, classId, role },
      });
    }
  }

  /**
   * Administrator: Assign or remove course role (e.g. LEAD_INSTRUCTOR, INSTRUCTOR, TA).
   */
  static async adminManageCourseRole(userId: string, courseOfferingId: string, role: CourseRole, assign: boolean) {
    if (assign) {
      return prisma.userCourseRole.upsert({
        where: { userId_courseOfferingId_role: { userId, courseOfferingId, role } },
        update: {},
        create: { userId, courseOfferingId, role },
      });
    } else {
      return prisma.userCourseRole.deleteMany({
        where: { userId, courseOfferingId, role },
      });
    }
  }
}
