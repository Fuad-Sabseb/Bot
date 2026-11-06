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

export function initTelegramBot(): TelegramBot | null {
  const token = env.TELEGRAM_BOT_TOKEN;

  if (!token || token.startsWith("REPLACE_") || token.startsWith("YOUR_")) {
    console.warn("⚠️ Telegram Bot Token is not configured. Running backend without Telegram polling.");
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });

  // Error logging
  bot.on("polling_error", (err) => {
    console.error("Telegram Polling Error:", err.message);
  });

  // /start command
  bot.onText(/\/start/, async (msg) => {
    await sendMainMenu(bot, msg.chat.id, undefined, {
      username: msg.from?.username,
      firstName: msg.from?.first_name,
      lastName: msg.from?.last_name,
    });
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
