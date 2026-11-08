import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { env } from "../../../config/env";
import { telegramState } from "../state";
import { sendMainMenu } from "./start.handler";
import { backButton } from "../keyboards";

export async function isUserAdmin(chatId: number | bigint): Promise<boolean> {
  const bigIntId = BigInt(chatId);
  if (bigIntId === env.TELEGRAM_ADMIN_CHAT_ID) return true;

  const user = await prisma.user.findUnique({
    where: { telegramChatId: bigIntId },
    include: { globalRoles: true, courseRoles: true },
  });

  return (
    !!user?.globalRoles.some((r) => r.role === "ADMIN") ||
    !!user?.courseRoles.some(
      (r) => r.role === "INSTRUCTOR" || r.role === "LEAD_INSTRUCTOR"
    )
  );
}

export async function handleAnnouncementsCommand(
  bot: TelegramBot,
  chatId: number | bigint,
  messageId?: number
): Promise<void> {
  const numericChatId = typeof chatId === "bigint" ? Number(chatId) : chatId;
  const authorized = await isUserAdmin(chatId);

  const announcements = await prisma.announcement.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { fullName: true } },
      class: { select: { name: true } },
      courseOffering: { include: { course: true } },
    },
  });

  let text = `📢 *Academic & University Announcements*\n\n`;

  if (announcements.length === 0) {
    text += `There are currently no active announcements.`;
  } else {
    announcements.forEach((a, idx) => {
      const scope = a.courseOffering
        ? `[${a.courseOffering.course.code}]`
        : a.class
        ? `[Class: ${a.class.name}]`
        : `[University-Wide]`;
      const dateStr = a.createdAt.toLocaleDateString();
      text += `${idx + 1}. *${a.title}* ${scope}\n`;
      text += `   📅 ${dateStr} | 👤 By ${a.author.fullName}\n`;
      text += `   ${a.content}\n\n`;
    });
  }

  const inline_keyboard: TelegramBot.InlineKeyboardButton[][] = [];
  if (authorized) {
    inline_keyboard.push([{ text: "📢 Broadcast New Announcement", callback_data: "announcement" }]);
  }
  inline_keyboard.push([{ text: "⬅️ Back to Menu", callback_data: "back_menu" }]);

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: numericChatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard },
      });
      return;
    } catch {
      // Fallback
    }
  }

  await bot.sendMessage(numericChatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard },
  });
}

export async function handleAnnouncementBroadcast(
  bot: TelegramBot,
  chatId: number,
  announcementText: string
): Promise<void> {
  const authorized = await isUserAdmin(chatId);

  if (!authorized) {
    await bot.sendMessage(chatId, "❌ Access denied. Only administrators or faculty may broadcast announcements.");
    telegramState.clearState(chatId);
    return sendMainMenu(bot, chatId);
  }

  // Fetch author
  const author = await prisma.user.findUnique({
    where: { telegramChatId: BigInt(chatId) },
  });

  // Persist announcement in PostgreSQL database
  if (author) {
    await prisma.announcement.create({
      data: {
        authorId: author.id,
        title: announcementText.length > 50 ? `${announcementText.slice(0, 47)}...` : announcementText,
        content: announcementText,
        priority: "HIGH",
      },
    });
  }

  // Fetch all registered Telegram users who haven't disabled announcement notifications
  const registeredUsers = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      isActive: true,
      isDeleted: false,
    },
    include: {
      notificationPref: true,
    },
  });

  let sentCount = 0;
  for (const user of registeredUsers) {
    // Check if user disabled announcement alerts
    if (user.notificationPref && !user.notificationPref.announcements) {
      continue;
    }
    if (user.notificationPref && !user.notificationPref.channelTelegram) {
      continue;
    }

    if (user.telegramChatId) {
      try {
        await bot.sendMessage(
          Number(user.telegramChatId),
          `📢 *University Announcement*\n\n${announcementText}\n\n_Sent by ${author?.fullName || "Faculty Administration"}_`,
          { parse_mode: "Markdown" }
        );
        sentCount++;
      } catch (err) {
        // User may have blocked the bot, continue broadcast
      }
    }
  }

  await bot.sendMessage(chatId, `📢 Broadcast sent to ${sentCount} students!`);
  telegramState.clearState(chatId);
  await sendMainMenu(bot, chatId);
}
