import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { env } from "../../../config/env";
import { telegramState } from "../state";
import { sendMainMenu } from "./start.handler";

export async function handleFeedbackSubmission(
  bot: TelegramBot,
  chatId: number,
  feedbackText: string
): Promise<void> {
  const bigIntChatId = BigInt(chatId);

  try {
    const user = await prisma.user.findUnique({
      where: { telegramChatId: bigIntChatId },
    });

    await prisma.feedback.create({
      data: {
        chatId: bigIntChatId,
        userId: user?.id || null,
        content: feedbackText.trim(),
        status: "OPEN",
      },
    });

    await bot.sendMessage(chatId, "✅ Saved! Thank you for your feedback.");

    // Notify administrator
    const adminChatId = Number(env.TELEGRAM_ADMIN_CHAT_ID);
    const senderInfo = user ? `${user.fullName} (${user.campusId || "Unlinked"})` : `Chat ID ${chatId}`;
    await bot.sendMessage(
      adminChatId,
      `💬 *New Feedback Received*\n👤 *From:* ${senderInfo}\n📝 *Content:*\n${feedbackText}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("Feedback submission error:", err);
    await bot.sendMessage(chatId, "❌ Failed to save feedback. Please try again.");
  } finally {
    telegramState.clearState(chatId);
    await sendMainMenu(bot, chatId);
  }
}
