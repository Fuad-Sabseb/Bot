import TelegramBot from "node-telegram-bot-api";
import { backButton } from "../keyboards";

export async function handleHelp(
  bot: TelegramBot,
  chatId: number,
  messageId?: number
): Promise<void> {
  const helpText =
    `❓ *Campus Super App Help Guide*\n\n` +
    `🎓 *Join Group:* Verify your Campus ID to receive a single-use invitation to your official class Telegram group.\n` +
    `📤 *Assignments:* Upload individual or group assignment submissions securely.\n` +
    `📢 *Announcements:* Receive real-time academic broadcasts from faculty and class representatives.\n` +
    `💬 *Feedback:* Submit direct feedback or report academic issues to the administrator.\n` +
    `🧑‍💼 *Admin:* Authorized class representatives and administrators can manage class resources.`;

  if (messageId) {
    await bot.editMessageText(helpText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: backButton,
    });
    return;
  }

  await bot.sendMessage(chatId, helpText, {
    parse_mode: "Markdown",
    reply_markup: backButton,
  });
}
