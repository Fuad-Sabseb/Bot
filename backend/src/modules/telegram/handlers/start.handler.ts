import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { mainMenuKeyboard, miniAppReplyKeyboard } from "../keyboards";
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

  // Send Mini App persistent drawer button to override any legacy reply keyboards
  try {
    await bot.sendMessage(
      numericChatId,
      "⚡ *Campus Super App*: Tap below to launch full Web Mini App or choose from the bot menu.",
      {
        parse_mode: "Markdown",
        reply_markup: miniAppReplyKeyboard,
      }
    );
  } catch (err: any) {
    console.warn("Notice sending miniAppReplyKeyboard:", err.message);
  }

  await bot.sendMessage(numericChatId, text, options);
}
