import { prisma } from "../../database/prisma";
import { NotificationType } from "@prisma/client";

export class NotificationsService {
  /**
   * Fetch paginated notifications for a user and count unread notifications.
   */
  static async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Mark a single notification as read.
   */
  static async markAsRead(userId: string, notificationId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new Error("NOTIFICATION_NOT_FOUND");
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Mark all unread notifications as read for a user.
   */
  static async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Retrieve notification preferences for a user, initializing defaults if none exist.
   */
  static async getPreferences(userId: string) {
    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.notificationPreference.create({
        data: {
          userId,
          channelTelegram: true,
          channelEmail: true,
          channelWeb: true,
          remind3Days: true,
          remind1Day: true,
          remind2Hours: true,
          announcements: true,
        },
      });
    }

    return prefs;
  }

  /**
   * Update notification preferences for a user.
   */
  static async updatePreferences(
    userId: string,
    data: {
      channelTelegram?: boolean;
      channelEmail?: boolean;
      channelWeb?: boolean;
      remind3Days?: boolean;
      remind1Day?: boolean;
      remind2Hours?: boolean;
      announcements?: boolean;
    }
  ) {
    return prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });
  }

  /**
   * Create an in-app notification for a user.
   */
  static async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    link?: string
  ) {
    return prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        link,
      },
    });
  }
}
