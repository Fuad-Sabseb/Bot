import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { mainMenuKeyboard } from "../keyboards";
import { telegramState } from "../state";

export async function sendMainMenu(
  bot: TelegramBot,
  chatId: number | bigint,
  messageId?: number,
  userMeta?: { username?: string; firstName?: string; lastName?: string }
): Promise<void> {
  const numericChatId = typeof chatId === "bigint" ? Number(chatId) : chatId;
  const bigIntChatId = BigInt(chatId);

  // Sync / register Telegram user in PostgreSQL database
  try {
    const existing = await prisma.user.findUnique({
      where: { telegramChatId: bigIntChatId },
    });

    if (!existing) {
      const fullName = [userMeta?.firstName, userMeta?.lastName].filter(Boolean).join(" ") || `Student_${chatId}`;
      await prisma.user.create({
        data: {
          telegramChatId: bigIntChatId,
          telegramUsername: userMeta?.username || null,
          fullName,
          isActive: true,
          globalRoles: {
            create: { role: "USER" },
          },
        },
      });
    }
  } catch (err) {
    console.error("Error syncing Telegram user to database:", err);
  }

  const text = "🏠 *Campus Super App*";
  const options: TelegramBot.SendMessageOptions = {
    parse_mode: "Markdown",
    reply_markup: mainMenuKeyboard,
  };

  telegramState.setState(chatId, "menu");

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: numericChatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: mainMenuKeyboard,
      });
      return;
    } catch {
      // If edit fails (e.g. content identical), send fresh message
    }
  }

  await bot.sendMessage(numericChatId, text, options);
}
