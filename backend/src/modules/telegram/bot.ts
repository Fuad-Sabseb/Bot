import TelegramBot from "node-telegram-bot-api";
import { env } from "../../config/env";
import { telegramState } from "./state";
import { backButton, assignmentMenuKeyboard, adminPanelKeyboard, WEB_APP_URL } from "./keyboards";
import { sendMainMenu } from "./handlers/start.handler";
import { handleJoinIdSubmission } from "./handlers/join.handler";
import {
  handleAssignmentsCommand,
  handleDocumentUpload,
} from "./handlers/assignment.handler";
import {
  handleAnnouncementsCommand,
  handleAnnouncementBroadcast,
  isUserAdmin,
} from "./handlers/announcement.handler";
import { handleFeedbackSubmission } from "./handlers/feedback.handler";
import { handleAdminCallback } from "./handlers/admin.handler";
import { handleHelp } from "./handlers/help.handler";
import { handleArchiveCommand, handleArchiveCallback } from "./handlers/archive.handler";
import {
  handleQuizzesCommand,
  handlePracticeCommand,
  handleQuizCallback,
} from "./handlers/quiz.handler";
import { handleBlogCommand, handleBlogCallback } from "./handlers/blog.handler";
import { handleAICommand, handleAICallback } from "./handlers/ai.handler";
import { handleCoursesCommand } from "./handlers/courses.handler";
import { handleMaterialsCommand } from "./handlers/materials.handler";
import {
  handleSettingsCommand,
  handleSettingsToggle,
} from "./handlers/settings.handler";
import { handleProfileCommand } from "./handlers/profile.handler";
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

  // Configure persistent Chat Menu Button to open Web App full-screen
  try {
    (bot as any).setChatMenuButton({
      menu_button: {
        type: "web_app",
        text: "Campus App",
        web_app: { url: WEB_APP_URL },
      },
    }).catch((err: any) => {
      console.warn("Notice: setChatMenuButton:", err.message);
    });
  } catch (err: any) {
    console.warn("Could not set chat menu button:", err.message);
  }

  // Error logging
  bot.on("polling_error", (err) => {
    console.error("Telegram Polling Error:", err.message);
  });

  // /miniapp or /webapp command to explicitly get the WebApp launch button
  bot.onText(/\/(?:webapp|miniapp|portal|app)/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "🚀 *Campus Super App Portal*\nTap the button below to launch the Mini App inside Telegram:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Launch Campus Portal",
                web_app: { url: WEB_APP_URL },
              },
            ],
          ],
        },
      }
    );
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

  // /courses command
  bot.onText(/\/courses/, async (msg) => {
    await handleCoursesCommand(bot, msg.chat.id);
  });

  // /assignments command
  bot.onText(/\/assignments/, async (msg) => {
    await handleAssignmentsCommand(bot, msg.chat.id);
  });

  // /materials <query> command
  bot.onText(/\/materials(?:\s+(.+))?/, async (msg, match) => {
    const query = match ? match[1] : undefined;
    await handleMaterialsCommand(bot, msg.chat.id, query);
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

  // /announcements command
  bot.onText(/\/announcements/, async (msg) => {
    await handleAnnouncementsCommand(bot, msg.chat.id);
  });

  // /settings command
  bot.onText(/\/settings/, async (msg) => {
    await handleSettingsCommand(bot, msg.chat.id);
  });

  // /profile and /me commands
  bot.onText(/\/(?:profile|me)/, async (msg) => {
    await handleProfileCommand(bot, msg.chat.id);
  });

  // /help command
  bot.onText(/\/help/, async (msg) => {
    await handleHelp(bot, msg.chat.id);
  });

  // /feedback command
  bot.onText(/\/feedback(?:\s+(.+))?/, async (msg, match) => {
    const text = match ? match[1] : undefined;
    if (text) {
      await handleFeedbackSubmission(bot, msg.chat.id, text);
    } else {
      telegramState.setState(msg.chat.id, "feedback_waiting_text");
      await bot.sendMessage(
        msg.chat.id,
        "💬 Type your feedback or suggestion for the class administrators:",
        { reply_markup: backButton }
      );
    }
  });

  // /admin command
  bot.onText(/\/admin/, async (msg) => {
    const authorized = await isUserAdmin(msg.chat.id);
    if (!authorized) {
      await bot.sendMessage(msg.chat.id, "❌ Access denied. Administrator privileges required.");
      return;
    }
    await bot.sendMessage(msg.chat.id, "🧑‍💼 *Admin Dashboard*", {
      parse_mode: "Markdown",
      reply_markup: adminPanelKeyboard,
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

    if (data === "noop") return;

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

    // Courses & Offerings
    if (data === "my_courses") {
      return handleCoursesCommand(bot, chatId, 1, messageId);
    }
    if (data.startsWith("courses_page_")) {
      const page = parseInt(data.replace("courses_page_", ""), 10) || 1;
      return handleCoursesCommand(bot, chatId, page, messageId);
    }

    // Assignments
    if (data === "assignment" || data === "assign_list") {
      return handleAssignmentsCommand(bot, chatId, 1, messageId);
    }
    if (data.startsWith("assign_page_")) {
      const page = parseInt(data.replace("assign_page_", ""), 10) || 1;
      return handleAssignmentsCommand(bot, chatId, page, messageId);
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

    // Study Materials
    if (data === "study_materials") {
      return handleMaterialsCommand(bot, chatId, undefined, 1, messageId);
    }
    if (data.startsWith("mat_page_")) {
      const page = parseInt(data.replace("mat_page_", ""), 10) || 1;
      return handleMaterialsCommand(bot, chatId, undefined, page, messageId);
    }

    // Quizzes & Practice
    if (data === "quizzes_menu" || data.startsWith("prac_ans_")) {
      return handleQuizCallback(bot, chatId, messageId, data);
    }

    // Archive
    if (data === "academic_archive") {
      return handleArchiveCallback(bot, chatId, messageId);
    }

    // Blog
    if (data === "community_blog" || data.startsWith("blog_read_")) {
      return handleBlogCallback(bot, chatId, messageId, data);
    }

    // AI Assistant
    if (data === "ai_assistant") {
      return handleAICallback(bot, chatId, messageId);
    }

    // Announcements
    if (data === "announcements_list") {
      return handleAnnouncementsCommand(bot, chatId, messageId);
    }
    if (data === "announcement") {
      const authorized = await isUserAdmin(chatId);
      if (!authorized) {
        return bot.sendMessage(chatId, "❌ Access denied. Only administrators or faculty may broadcast announcements.");
      }
      telegramState.setState(chatId, "announcement_waiting_text");
      return bot.editMessageText("📢 Type your *important announcement* to broadcast to all registered students:", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
    }

    // Feedback
    if (data === "feedback") {
      telegramState.setState(chatId, "feedback_waiting_text");
      return bot.editMessageText("💬 Type your feedback or suggestion for the class administrators:", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: backButton,
      });
    }

    // User Profile
    if (data === "user_profile") {
      return handleProfileCommand(bot, chatId, messageId);
    }

    // Settings & Notification Preferences
    if (data === "settings_menu") {
      return handleSettingsCommand(bot, chatId, messageId);
    }
    if (data.startsWith("toggle_")) {
      return handleSettingsToggle(bot, chatId, messageId, data);
    }

    // Admin Panel
    if (data.startsWith("admin_")) {
      return handleAdminCallback(bot, query);
    }

    // Help
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

  console.log("🚀 Refactored Unified Telegram Bot Engine initialized successfully.");
  return bot;
}
