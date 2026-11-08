import TelegramBot from "node-telegram-bot-api";
import { backButton } from "../keyboards";

export async function handleHelp(
  bot: TelegramBot,
  chatId: number,
  messageId?: number
): Promise<void> {
  const helpText =
    `❓ *Campus Super App — Unified Bot Guide*\n\n` +
    `Welcome to the unified campus companion bot! Use the interactive buttons below or type any slash command:\n\n` +
    `📚 *Academic Life:*\n` +
    `• \`/courses\` — View your enrolled courses, class, semester & instructors\n` +
    `• \`/assignments\` — Track upcoming deadlines, submission status & grades\n` +
    `• \`/materials [query]\` — Browse approved lecture slides, syllabus & notes\n` +
    `• \`/quizzes\` — Formal timed quizzes and evaluations\n` +
    `• \`/practice [topic]\` — Practice arena with instant grading & explanations\n` +
    `• \`/archive [query]\` or \`/past_exams\` — Previous exams & past project repository\n\n` +
    `✍️ *Student Community & AI:*\n` +
    `• \`/blog [query]\` — Student articles, ideas & discussions\n` +
    `• \`/ai <prompt>\` or \`/ask <prompt>\` — AI Academic Assistant with course material RAG\n\n` +
    `⚙️ *Account & Settings:*\n` +
    `• \`/profile\` or \`/me\` — View linked campus ID, roles & daily AI quota\n` +
    `• \`/link <6-digit-otp>\` — Synchronize your web platform account with Telegram\n` +
    `• \`/settings\` — Customize automated 3-day, 24-hr & 2-hr deadline reminder alerts\n` +
    `• \`/announcements\` — View recent official university broadcasts\n` +
    `• \`/feedback\` — Send feedback to class representatives & admins\n` +
    `• \`/admin\` — Administrator analytics & dashboard`;

  if (messageId) {
    try {
      await bot.editMessageText(helpText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
      return;
    } catch {
      // Fallback
    }
  }

  await bot.sendMessage(chatId, helpText, {
    parse_mode: "Markdown",
    reply_markup: backButton,
  });
}
