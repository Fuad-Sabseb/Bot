import TelegramBot from "node-telegram-bot-api";
import { env } from "../../config/env";
import { telegramState } from "./state";
import { backButton, assignmentMenuKeyboard } from "./keyboards";
import { sendMainMenu } from "./handlers/start.handler";
import { handleJoinIdSubmission } from "./handlers/join.handler";
import { handleDocumentUpload } from "./handlers/assignment.handler";
import { handleAnnouncementBroadcast, isUserAdmin } from "./handlers/announcement.handler";
import { handleFeedbackSubmission } from "./handlers/feedback.handler";
import { handleAdminCallback } from "./handlers/admin.handler";
import { handleHelp } from "./handlers/help.handler";
import { handleArchiveCommand, handleArchiveCallback } from "./handlers/archive.handler";
import { handleQuizzesCommand, handlePracticeCommand, handleQuizCallback } from "./handlers/quiz.handler";
import { handleBlogCommand, handleBlogCallback } from "./handlers/blog.handler";
import { handleAICommand, handleAICallback } from "./handlers/ai.handler";
import { UsersService } from "../users/users.service";

let activeBotInstance: TelegramBot | null = null;

export function getTelegramBot(): TelegramBot | null {
  return activeBotInstance;
}

export async function sendTelegramNotification(
  chatId: string | bigint | number,
  message: string,
  options?: TelegramBot.SendMessageOptions
): Promise<boolean> {
  const bot = getTelegramBot();
  if (!bot) return false;

  try {
    await bot.sendMessage(chatId.toString(), message, { parse_mode: "Markdown", ...options });
    return true;
  } catch (err: any) {
    console.warn(`⚠️ Failed to send Telegram notification to ${chatId}:`, err.message);
    return false;
  }
}

export function initTelegramBot(): TelegramBot | null {
  const token = env.TELEGRAM_BOT_TOKEN;

  if (!token || token.startsWith("REPLACE_") || token.startsWith("YOUR_")) {
    console.warn("⚠️ Telegram Bot Token is not configured. Running backend without Telegram polling.");
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });
  activeBotInstance = bot;

  // Error logging
  bot.on("polling_error", (err) => {
    console.error("Telegram Polling Error:", err.message);
  });

  // /start command (supports deep-linking: /start link_123456)
  bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const param = match ? match[1] : undefined;
    if (param && param.startsWith("link_")) {
      const otp = param.replace("link_", "").trim();
      try {
        const res = await UsersService.verifyTelegramLinkToken(otp, msg.chat.id, msg.from?.username);
        await bot.sendMessage(
          msg.chat.id,
          `✅ *Account Linked Successfully!*\nWelcome, *${res.user.fullName}*!\nYour Telegram account is now synchronized with the university platform.`,
          { parse_mode: "Markdown" }
        );
      } catch (err: any) {
        await bot.sendMessage(msg.chat.id, `❌ Linking failed: ${err.message}`);
      }
    }

    await sendMainMenu(bot, msg.chat.id, undefined, {
      username: msg.from?.username,
      firstName: msg.from?.first_name,
      lastName: msg.from?.last_name,
    });
  });

  // /link <otp> command
  bot.onText(/\/link(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const otp = match ? match[1] : undefined;
    if (!otp) {
      await bot.sendMessage(
        chatId,
        "⚠️ Usage: `/link <6-digit-otp>`\nGenerate your linking OTP from your web profile dashboard.",
        { parse_mode: "Markdown" }
      );
      return;
    }
    try {
      const res = await UsersService.verifyTelegramLinkToken(otp, chatId, msg.from?.username);
      await bot.sendMessage(
        chatId,
        `✅ *Account Linked Successfully!*\nWelcome, *${res.user.fullName}* (${res.user.campusId || "Student"})!\nYour Telegram account is now synchronized with the university web platform.`,
        { parse_mode: "Markdown" }
      );
      await sendMainMenu(bot, chatId);
    } catch (err: any) {
      await bot.sendMessage(chatId, `❌ Linking failed: ${err.message || "Invalid or expired OTP"}`);
    }
  });

  // /archive <query> command
  bot.onText(/\/archive(?:\s+(.+))?/, async (msg, match) => {
    const query = match ? match[1] : undefined;
    await handleArchiveCommand(bot, msg.chat.id, query);
  });

  // /past_exams <query> command
  bot.onText(/\/past_exams(?:\s+(.+))?/, async (msg, match) => {
    const query = match ? match[1] : undefined;
    await handleArchiveCommand(bot, msg.chat.id, query);
  });

  // /quizzes command
  bot.onText(/\/quizzes/, async (msg) => {
    await handleQuizzesCommand(bot, msg.chat.id);
  });

  // /practice <topic> command
  bot.onText(/\/practice(?:\s+(.+))?/, async (msg, match) => {
    const topic = match ? match[1] : undefined;
    await handlePracticeCommand(bot, msg.chat.id, topic);
  });

  // /blog and /articles command
  bot.onText(/\/(?:blog|articles)(?:\s+(.+))?/, async (msg, match) => {
    const query = match ? match[1] : undefined;
    await handleBlogCommand(bot, msg.chat.id, query);
  });

  // /ai and /ask commands
  bot.onText(/\/(?:ai|ask)(?:\s+(.+))?/, async (msg, match) => {
    const prompt = match ? match[1] : undefined;
    await handleAICommand(bot, msg.chat.id, prompt);
  });

  // Callback Query Dispatcher
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id;
    const messageId = query.message?.message_id;
    const data = query.data;

    if (!chatId || !data) return;

    try {
      await bot.answerCallbackQuery(query.id);
    } catch {
      // Ignore if query expired
    }

    if (data === "back_menu") {
      return sendMainMenu(bot, chatId, messageId);
    }

    if (data === "join_group") {
      telegramState.setState(chatId, "join_waiting_id");
      return bot.editMessageText("🎓 Send your *Campus ID* (e.g. `RU0018/17`):", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
    }

    if (data === "quizzes_menu" || data.startsWith("prac_ans_")) {
      return handleQuizCallback(bot, chatId, messageId, data);
    }

    if (data === "community_blog" || data.startsWith("blog_read_")) {
      return handleBlogCallback(bot, chatId, messageId, data);
    }

    if (data === "ai_assistant") {
      return handleAICallback(bot, chatId, messageId);
    }

    if (data === "academic_archive") {
      return handleArchiveCallback(bot, chatId, messageId);
    }

    if (data === "assignment") {
      return bot.editMessageText("📤 *Choose Assignment Submission Type:*", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: assignmentMenuKeyboard,
      });
    }

    if (data === "assignment_individual") {
      telegramState.setState(chatId, "assignment_individual");
      return bot.sendMessage(chatId, "📄 Upload your *INDIVIDUAL* assignment file (PDF, DOCX, ZIP, max 50MB):", {
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
    }

    if (data === "assignment_group") {
      telegramState.setState(chatId, "assignment_group");
      return bot.sendMessage(chatId, "👥 Upload your *GROUP* assignment file (PDF, DOCX, ZIP, max 50MB):", {
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
    }

    if (data === "announcement") {
      const authorized = await isUserAdmin(chatId);
      if (!authorized) {
        return bot.sendMessage(chatId, "❌ Access denied. Only administrators may broadcast announcements.");
      }
      telegramState.setState(chatId, "announcement_waiting_text");
      return bot.editMessageText("📢 Type your *important announcement* to broadcast to all class students:", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
    }

    if (data === "feedback") {
      telegramState.setState(chatId, "feedback_waiting_text");
      return bot.editMessageText("💬 Type your feedback or suggestion for the class administrators:", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: backButton,
      });
    }

    if (data.startsWith("admin_")) {
      return handleAdminCallback(bot, query);
    }

    if (data === "help") {
      return handleHelp(bot, chatId, messageId);
    }
  });

  // Message Handler for State Transitions
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (!text || text.startsWith("/")) return;

    const state = telegramState.getState(chatId);

    if (state === "join_waiting_id") {
      return handleJoinIdSubmission(bot, chatId, text);
    }

    if (state === "announcement_waiting_text") {
      return handleAnnouncementBroadcast(bot, chatId, text);
    }

    if (state === "feedback_waiting_text") {
      return handleFeedbackSubmission(bot, chatId, text);
    }

    if (!state && !msg.document) {
      return sendMainMenu(bot, chatId);
    }
  });

  // Document Upload Listener
  bot.on("document", async (msg) => {
    return handleDocumentUpload(bot, msg);
  });

  console.log("🚀 Refactored Telegram Bot Engine initialized successfully.");
  return bot;
}
