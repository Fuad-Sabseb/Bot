import { prisma } from "../database/prisma";
import { ReminderInterval, ReminderStatus, NotificationType } from "@prisma/client";
import { sendTelegramNotification } from "../modules/telegram/bot";

export class ReminderService {
  /**
   * Schedule 3-day, 1-day, and 2-hour reminders for an assignment across all enrolled students.
   */
  static async scheduleAssignmentReminders(assignmentId: string): Promise<number> {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        courseOffering: {
          include: {
            enrollments: {
              where: { status: "ACTIVE" },
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!assignment || assignment.isArchived) {
      return 0;
    }

    const dueTime = assignment.dueDate.getTime();
    const now = Date.now();

    const intervals: { interval: ReminderInterval; scheduledFor: Date }[] = [
      {
        interval: ReminderInterval.THREE_DAYS,
        scheduledFor: new Date(dueTime - 3 * 24 * 60 * 60 * 1000),
      },
      {
        interval: ReminderInterval.ONE_DAY,
        scheduledFor: new Date(dueTime - 24 * 60 * 60 * 1000),
      },
      {
        interval: ReminderInterval.TWO_HOURS,
        scheduledFor: new Date(dueTime - 2 * 60 * 60 * 1000),
      },
    ];

    // Filter out intervals that are already past
    const applicableIntervals = intervals.filter((item) => item.scheduledFor.getTime() > now);
    if (applicableIntervals.length === 0) {
      return 0;
    }

    const enrolledStudentIds = assignment.courseOffering.enrollments.map((e) => e.userId);
    if (enrolledStudentIds.length === 0) {
      return 0;
    }

    // Cancel existing pending reminders for this assignment to avoid duplicates
    await prisma.scheduledReminder.updateMany({
      where: {
        assignmentId,
        status: ReminderStatus.PENDING,
      },
      data: {
        status: ReminderStatus.CANCELLED,
      },
    });

    // Create new scheduled reminders
    const remindersToCreate: {
      assignmentId: string;
      userId: string;
      interval: ReminderInterval;
      scheduledFor: Date;
      status: ReminderStatus;
    }[] = [];

    for (const studentId of enrolledStudentIds) {
      for (const item of applicableIntervals) {
        remindersToCreate.push({
          assignmentId,
          userId: studentId,
          interval: item.interval,
          scheduledFor: item.scheduledFor,
          status: ReminderStatus.PENDING,
        });
      }
    }

    const result = await prisma.scheduledReminder.createMany({
      data: remindersToCreate,
      skipDuplicates: true,
    });

    return result.count;
  }

  /**
   * Cancel pending reminders for a student who has submitted an assignment.
   */
  static async cancelStudentReminders(assignmentId: string, userId: string): Promise<number> {
    const result = await prisma.scheduledReminder.updateMany({
      where: {
        assignmentId,
        userId,
        status: ReminderStatus.PENDING,
      },
      data: {
        status: ReminderStatus.CANCELLED,
      },
    });
    return result.count;
  }

  /**
   * Cancel pending reminders for an entire group.
   */
  static async cancelGroupReminders(assignmentId: string, groupId: string): Promise<number> {
    const members = await prisma.assignmentGroupMember.findMany({
      where: { assignmentId, groupId },
      select: { userId: true },
    });

    const userIds = members.map((m) => m.userId);
    if (userIds.length === 0) return 0;

    const result = await prisma.scheduledReminder.updateMany({
      where: {
        assignmentId,
        userId: { in: userIds },
        status: ReminderStatus.PENDING,
      },
      data: {
        status: ReminderStatus.CANCELLED,
      },
    });
    return result.count;
  }

  /**
   * Process and dispatch all pending reminders due at or before now.
   */
  static async processDueReminders(): Promise<{ processed: number; sent: number; cancelled: number }> {
    const now = new Date();

    const dueReminders = await prisma.scheduledReminder.findMany({
      where: {
        status: ReminderStatus.PENDING,
        scheduledFor: { lte: now },
      },
      include: {
        assignment: true,
        user: {
          include: {
            notificationPref: true,
          },
        },
      },
      take: 200, // Batch limit
    });

    let processed = 0;
    let sent = 0;
    let cancelled = 0;

    for (const reminder of dueReminders) {
      processed++;

      // Check if assignment is archived
      if (reminder.assignment.isArchived) {
        await prisma.scheduledReminder.update({
          where: { id: reminder.id },
          data: { status: ReminderStatus.CANCELLED },
        });
        cancelled++;
        continue;
      }

      // Check if user already submitted
      let alreadySubmitted = false;
      if (reminder.assignment.type === "INDIVIDUAL") {
        const submission = await prisma.assignmentSubmission.findFirst({
          where: {
            assignmentId: reminder.assignmentId,
            studentId: reminder.userId,
            isCurrentVersion: true,
          },
        });
        if (submission) alreadySubmitted = true;
      } else {
        // Group assignment: check if user's group has submitted
        const member = await prisma.assignmentGroupMember.findFirst({
          where: {
            assignmentId: reminder.assignmentId,
            userId: reminder.userId,
          },
        });

        if (member) {
          const submission = await prisma.assignmentSubmission.findFirst({
            where: {
              assignmentId: reminder.assignmentId,
              groupId: member.groupId,
              isCurrentVersion: true,
            },
          });
          if (submission) alreadySubmitted = true;
        }
      }

      if (alreadySubmitted) {
        await prisma.scheduledReminder.update({
          where: { id: reminder.id },
          data: { status: ReminderStatus.CANCELLED },
        });
        cancelled++;
        continue;
      }

      // Check user preferences
      const prefs = reminder.user.notificationPref;
      let intervalEnabled = true;
      if (prefs) {
        if (reminder.interval === ReminderInterval.THREE_DAYS && !prefs.remind3Days) intervalEnabled = false;
        if (reminder.interval === ReminderInterval.ONE_DAY && !prefs.remind1Day) intervalEnabled = false;
        if (reminder.interval === ReminderInterval.TWO_HOURS && !prefs.remind2Hours) intervalEnabled = false;
      }

      if (!intervalEnabled) {
        await prisma.scheduledReminder.update({
          where: { id: reminder.id },
          data: { status: ReminderStatus.CANCELLED },
        });
        cancelled++;
        continue;
      }

      const humanInterval =
        reminder.interval === ReminderInterval.THREE_DAYS
          ? "3 days"
          : reminder.interval === ReminderInterval.ONE_DAY
          ? "24 hours"
          : "2 hours";

      const title = `Deadline Reminder: ${reminder.assignment.title}`;
      const message = `⏰ Your assignment "${reminder.assignment.title}" is due in ${humanInterval} on ${reminder.assignment.dueDate.toLocaleString()}. Please submit your work before the deadline!`;

      // 1. In-App Notification (Channel Web)
      const channelWeb = prefs ? prefs.channelWeb : true;
      if (channelWeb) {
        await prisma.notification.create({
          data: {
            userId: reminder.userId,
            type: NotificationType.DEADLINE_REMINDER,
            title,
            message,
            link: `/assignments/${reminder.assignmentId}`,
          },
        });
      }

      // 2. Telegram Notification
      const channelTelegram = prefs ? prefs.channelTelegram : true;
      if (channelTelegram && reminder.user.telegramChatId) {
        await sendTelegramNotification(
          reminder.user.telegramChatId,
          `⏰ *Deadline Reminder: ${reminder.assignment.title}*\n\n` +
            `Your assignment is due in *${humanInterval}* (Due: ${reminder.assignment.dueDate.toUTCString()}).\n\n` +
            `Please make sure to finalize and upload your submission.`
        );
      }

      // Mark reminder SENT
      await prisma.scheduledReminder.update({
        where: { id: reminder.id },
        data: {
          status: ReminderStatus.SENT,
          sentAt: new Date(),
        },
      });

      sent++;
    }

    return { processed, sent, cancelled };
  }

  private static workerInterval: NodeJS.Timeout | null = null;

  /**
   * Start recurring background reminder worker.
   */
  static startBackgroundReminderWorker(intervalMs: number = 60000): NodeJS.Timeout {
    if (this.workerInterval) {
      return this.workerInterval;
    }

    console.log(`⏱️ Automatic background deadline reminder worker started (Interval: ${intervalMs / 1000}s).`);

    this.workerInterval = setInterval(async () => {
      try {
        const stats = await this.processDueReminders();
        if (stats.processed > 0) {
          console.log(
            `🔔 [DeadlineReminders] Processed ${stats.processed} reminders (${stats.sent} sent, ${stats.cancelled} cancelled).`
          );
        }
      } catch (err: any) {
        console.error("❌ [DeadlineReminders] Background reminder worker encountered error:", err.message);
      }
    }, intervalMs);

    return this.workerInterval;
  }

  /**
   * Stop recurring background reminder worker.
   */
  static stopBackgroundReminderWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
      console.log("🛑 Automatic background deadline reminder worker stopped.");
    }
  }
}
