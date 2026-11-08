import TelegramBot from "node-telegram-bot-api";

export const backButton: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "back_menu" }]],
};

export const mainMenuKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: "🎓 Join Group", callback_data: "join_group" },
      { text: "📚 My Courses", callback_data: "my_courses" },
    ],
    [
      { text: "📤 Assignments", callback_data: "assignment" },
      { text: "📖 Study Materials", callback_data: "study_materials" },
    ],
    [
      { text: "🎯 Practice & Quizzes", callback_data: "quizzes_menu" },
      { text: "🏛️ Archive & Past Exams", callback_data: "academic_archive" },
    ],
    [
      { text: "✍️ Student Blog", callback_data: "community_blog" },
      { text: "🤖 AI Assistant", callback_data: "ai_assistant" },
    ],
    [
      { text: "📢 Announcements", callback_data: "announcements_list" },
      { text: "💬 Feedback", callback_data: "feedback" },
    ],
    [
      { text: "👤 My Profile", callback_data: "user_profile" },
      { text: "⚙️ Settings", callback_data: "settings_menu" },
    ],
    [
      { text: "🧑‍💼 Admin", callback_data: "admin_panel" },
      { text: "❓ Help", callback_data: "help" },
    ],
  ],
};

export const assignmentMenuKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: "📋 View Assignments & Status", callback_data: "assign_list" }],
    [
      { text: "📄 Submit Individual", callback_data: "assignment_individual" },
      { text: "👥 Submit Group", callback_data: "assignment_group" },
    ],
    [{ text: "⬅️ Back to Menu", callback_data: "back_menu" }],
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
    [{ text: "⬅️ Back to Menu", callback_data: "back_menu" }],
  ],
};

export const adminAssignmentTypeKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: "📄 Individual", callback_data: "admin_individual_list" }],
    [{ text: "👥 Group", callback_data: "admin_group_list" }],
    [{ text: "⬅️ Back to Admin", callback_data: "admin_panel" }],
  ],
};

export function buildSettingsKeyboard(prefs: {
  remind3Days: boolean;
  remind1Day: boolean;
  remind2Hours: boolean;
  announcements: boolean;
  channelTelegram: boolean;
}): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: prefs.remind3Days ? "🔔 3-Day Reminders: ON" : "🔕 3-Day Reminders: OFF",
          callback_data: "toggle_remind_3d",
        },
      ],
      [
        {
          text: prefs.remind1Day ? "🔔 24-Hr Reminders: ON" : "🔕 24-Hr Reminders: OFF",
          callback_data: "toggle_remind_1d",
        },
      ],
      [
        {
          text: prefs.remind2Hours ? "🔔 2-Hr Reminders: ON" : "🔕 2-Hr Reminders: OFF",
          callback_data: "toggle_remind_2h",
        },
      ],
      [
        {
          text: prefs.announcements ? "📢 Broadcast Alerts: ON" : "🔕 Broadcast Alerts: OFF",
          callback_data: "toggle_remind_ann",
        },
      ],
      [
        {
          text: prefs.channelTelegram ? "📱 Telegram Channel: ON" : "🔕 Telegram Channel: OFF",
          callback_data: "toggle_remind_tg",
        },
      ],
      [{ text: "⬅️ Back to Menu", callback_data: "back_menu" }],
    ],
  };
}
