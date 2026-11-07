import TelegramBot from "node-telegram-bot-api";

export const backButton: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "back_menu" }]],
};

export const mainMenuKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: "🎓 Join Group", callback_data: "join_group" },
      { text: "📤 Assignment", callback_data: "assignment" },
    ],
    [
      { text: "🎯 Practice & Quizzes", callback_data: "quizzes_menu" },
      { text: "🏛️ Archive & Past Exams", callback_data: "academic_archive" },
    ],
    [
      { text: "✍️ Student Blog & Ideas", callback_data: "community_blog" },
      { text: "📢 Announcement", callback_data: "announcement" },
    ],
    [{ text: "💬 Feedback", callback_data: "feedback" }],
    [{ text: "🧑‍💼 Admin", callback_data: "admin_panel" }],
    [{ text: "❓ Help", callback_data: "help" }],
  ],
};

export const assignmentMenuKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: "📄 Submit Individual", callback_data: "assignment_individual" }],
    [{ text: "👥 Submit Group", callback_data: "assignment_group" }],
    [{ text: "⬅️ Back", callback_data: "back_menu" }],
  ],
};

export const adminPanelKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: "📊 Stats", callback_data: "admin_stats" },
      { text: "👥 Users", callback_data: "admin_users" },
    ],
    [
      { text: "📤 Assignments", callback_data: "admin_assignments" },
      { text: "💬 Feedback", callback_data: "admin_feedback" },
    ],
    [{ text: "⬅️ Back", callback_data: "back_menu" }],
  ],
};

export const adminAssignmentTypeKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: "📄 Individual", callback_data: "admin_individual_list" }],
    [{ text: "👥 Group", callback_data: "admin_group_list" }],
    [{ text: "⬅️ Back", callback_data: "admin_panel" }],
  ],
};
