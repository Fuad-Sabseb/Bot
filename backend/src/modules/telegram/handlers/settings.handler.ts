import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { buildSettingsKeyboard, backButton } from "../keyboards";

export async function handleSettingsCommand(
  bot: TelegramBot,
  chatId: number | bigint,
  messageId?: number
): Promise<void> {
  const numericChatId = typeof chatId === "bigint" ? Number(chatId) : chatId;
  const bigIntId = BigInt(chatId);

  let user = await prisma.user.findUnique({
    where: { telegramChatId: bigIntId },
    include: { notificationPref: true },
  });

  if (!user) {
    // If not existing, auto-provision
    user = await prisma.user.create({
      data: {
        telegramChatId: bigIntId,
        fullName: `Student_${numericChatId}`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
      include: { notificationPref: true },
    });
  }

  let prefs = user.notificationPref;
  if (!prefs) {
    prefs = await prisma.notificationPreference.create({
      data: {
        userId: user.id,
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

  const statusText =
    `⚙️ *Notification & Reminder Preferences*\n\n` +
    `Configure which alerts and automated deadline reminders you receive on Telegram:\n\n` +
    `• *3-Day Reminder:* ${prefs.remind3Days ? "✅ Active" : "❌ Disabled"}\n` +
    `• *24-Hour Reminder:* ${prefs.remind1Day ? "✅ Active" : "❌ Disabled"}\n` +
    `• *2-Hour Reminder:* ${prefs.remind2Hours ? "✅ Active" : "❌ Disabled"}\n` +
    `• *Broadcast Announcements:* ${prefs.announcements ? "✅ Active" : "❌ Disabled"}\n` +
    `• *Telegram Delivery:* ${prefs.channelTelegram ? "✅ Enabled" : "❌ Disabled"}\n\n` +
    `_Tap any button below to toggle settings:_`;

  const keyboard = buildSettingsKeyboard(prefs);

  if (messageId) {
    try {
      await bot.editMessageText(statusText, {
        chat_id: numericChatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      return;
    } catch {
      // Fallback
    }
  }

  await bot.sendMessage(numericChatId, statusText, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

export async function handleSettingsToggle(
  bot: TelegramBot,
  chatId: number | bigint,
  messageId: number | undefined,
  toggleKey: string
): Promise<void> {
  const numericChatId = typeof chatId === "bigint" ? Number(chatId) : chatId;
  const bigIntId = BigInt(chatId);

  const user = await prisma.user.findUnique({
    where: { telegramChatId: bigIntId },
    include: { notificationPref: true },
  });

  if (!user) {
    return handleSettingsCommand(bot, chatId, messageId);
  }

  let currentPrefs = user.notificationPref;
  if (!currentPrefs) {
    currentPrefs = await prisma.notificationPreference.create({
      data: {
        userId: user.id,
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

  const updateData: any = {};
  if (toggleKey === "toggle_remind_3d") {
    updateData.remind3Days = !currentPrefs.remind3Days;
  } else if (toggleKey === "toggle_remind_1d") {
    updateData.remind1Day = !currentPrefs.remind1Day;
  } else if (toggleKey === "toggle_remind_2h") {
    updateData.remind2Hours = !currentPrefs.remind2Hours;
  } else if (toggleKey === "toggle_remind_ann") {
    updateData.announcements = !currentPrefs.announcements;
  } else if (toggleKey === "toggle_remind_tg") {
    updateData.channelTelegram = !currentPrefs.channelTelegram;
  }

  await prisma.notificationPreference.update({
    where: { userId: user.id },
    data: updateData,
  });

  await handleSettingsCommand(bot, chatId, messageId);
}
