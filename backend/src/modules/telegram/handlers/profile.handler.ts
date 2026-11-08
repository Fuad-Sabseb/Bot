import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { backButton } from "../keyboards";

export async function handleProfileCommand(
  bot: TelegramBot,
  chatId: number | bigint,
  messageId?: number
): Promise<void> {
  const numericChatId = typeof chatId === "bigint" ? Number(chatId) : chatId;
  const bigIntId = BigInt(chatId);

  const user = await prisma.user.findUnique({
    where: { telegramChatId: bigIntId },
    include: {
      primaryClass: {
        include: { academicYear: true },
      },
      globalRoles: true,
      enrollments: {
        where: { status: "ACTIVE" },
      },
      aiQuota: true,
    },
  });

  if (!user || !user.campusId) {
    const text =
      `👤 *Student Profile & Account Sync*\n\n` +
      `⚠️ *Status:* Guest / Unlinked Account\n` +
      `Your Telegram account is currently not bound to an official student Campus ID.\n\n` +
      `*How to link your university account:*\n` +
      `1. Sign in to the web platform.\n` +
      `2. Click your avatar / *Settings*.\n` +
      `3. Click *Generate Telegram Link Token*.\n` +
      `4. In this chat, run: \`/link <6-digit-otp>\`\n\n` +
      `*Benefits of linking:*\n` +
      `• Real-time personalized deadline alerts\n` +
      `• Browse enrolled course materials & syllabus\n` +
      `• Instant quiz score and assignment status sync\n` +
      `• Seamless AI academic query quota synchronization`;

    if (messageId) {
      await bot.editMessageText(text, {
        chat_id: numericChatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
      return;
    }
    await bot.sendMessage(numericChatId, text, {
      parse_mode: "Markdown",
      reply_markup: backButton,
    });
    return;
  }

  const roles = user.globalRoles.map((r) => r.role).join(", ") || "STUDENT";
  const className = user.primaryClass?.name || "General Academic Pool";
  const enrolledCount = user.enrollments.length;

  // AI Quota information
  const dailyLimit = user.aiQuota?.dailyTokenLimit ?? 50000;
  const dailyUsed = user.aiQuota?.dailyTokensUsed ?? 0;
  const remainingTokens = Math.max(0, dailyLimit - dailyUsed);

  const text =
    `👤 *Student Profile*\n\n` +
    `• *Name:* ${user.fullName}\n` +
    `• *Campus ID:* \`${user.campusId}\`\n` +
    `• *Email:* ${user.email || "Not set"}\n` +
    `• *Roles:* \`${roles}\`\n` +
    `• *Class / Cohort:* ${className}\n` +
    `• *Active Enrolled Courses:* ${enrolledCount}\n` +
    `• *Telegram Handle:* @${user.telegramUsername || "n/a"}\n` +
    `• *Telegram Chat ID:* \`${numericChatId}\`\n` +
    `• *AI Assistant Quota:* ${remainingTokens.toLocaleString()} / ${dailyLimit.toLocaleString()} tokens left today\n` +
    `• *Status:* ✅ Verified & Synchronized with University Portal`;

  const inline_keyboard: TelegramBot.InlineKeyboardButton[][] = [
    [
      { text: "📚 View Courses", callback_data: "my_courses" },
      { text: "📤 View Assignments", callback_data: "assign_list" },
    ],
    [
      { text: "⚙️ Notification Settings", callback_data: "settings_menu" },
      { text: "⬅️ Back to Menu", callback_data: "back_menu" },
    ],
  ];

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
