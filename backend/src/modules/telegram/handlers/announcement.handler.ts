import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { env } from "../../../config/env";
import { telegramState } from "../state";
import { sendMainMenu } from "./start.handler";

export async function isUserAdmin(chatId: number | bigint): Promise<boolean> {
  const bigIntId = BigInt(chatId);
  if (bigIntId === env.TELEGRAM_ADMIN_CHAT_ID) return true;

  const user = await prisma.user.findUnique({
    where: { telegramChatId: bigIntId },
    include: { globalRoles: true },
  });

  return !!user?.globalRoles.some((r) => r.role === "ADMIN");
}

export async function handleAnnouncementBroadcast(
  bot: TelegramBot,
  chatId: number,
  announcementText: string
): Promise<void> {
  const authorized = await isUserAdmin(chatId);

  if (!authorized) {
    await bot.sendMessage(chatId, "❌ Access denied. Only administrators may broadcast announcements.");
    telegramState.clearState(chatId);
    return sendMainMenu(bot, chatId);
  }

  // Fetch all registered Telegram users from PostgreSQL
  const registeredUsers = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      isActive: true,
      isDeleted: false,
    },
    select: { telegramChatId: true },
  });

  let sentCount = 0;
  for (const user of registeredUsers) {
    if (user.telegramChatId) {
      try {
        await bot.sendMessage(
          Number(user.telegramChatId),
          `📢 *Important Announcement:*\n\n${announcementText}`,
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
