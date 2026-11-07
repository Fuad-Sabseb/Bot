import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import { prisma } from "../../../database/prisma";
import { isUserAdmin } from "./announcement.handler";
import {
  adminPanelKeyboard,
  adminAssignmentTypeKeyboard,
  backButton,
} from "../keyboards";

export async function handleAdminCallback(
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery
): Promise<void> {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data;

  if (!chatId || !data) return;

  const authorized = await isUserAdmin(chatId);
  if (!authorized) {
    await bot.sendMessage(chatId, "❌ Access denied. Administrator privileges required.");
    return;
  }

  if (data === "admin_panel") {
    await bot.editMessageText("🧑‍💼 *Admin Dashboard*", {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: adminPanelKeyboard,
    });
    return;
  }

  if (data === "admin_stats") {
    const totalUsers = await prisma.user.count({ where: { isDeleted: false } });
    const registeredIds = await prisma.campusIdRegistry.count();
    const usedIds = await prisma.campusIdRegistry.count({ where: { isUsed: true } });
    const feedbackCount = await prisma.feedback.count();

    const indivPath = path.resolve(process.cwd(), "storage", "assignments", "individual");
    const groupPath = path.resolve(process.cwd(), "storage", "assignments", "group");

    const indivCount = fs.existsSync(indivPath) ? fs.readdirSync(indivPath).filter((f) => !f.startsWith(".")).length : 0;
    const groupCount = fs.existsSync(groupPath) ? fs.readdirSync(groupPath).filter((f) => !f.startsWith(".")).length : 0;

    const statsText = `📊 *Real-Time System Statistics*\n\n` +
      `👥 Total Users: ${totalUsers}\n` +
      `🎓 Campus IDs in Registry: ${registeredIds}\n` +
      `✅ Claimed IDs: ${usedIds}\n` +
      `💬 Feedback Records: ${feedbackCount}\n` +
      `📄 Individual Submissions: ${indivCount}\n` +
      `👥 Group Submissions: ${groupCount}`;

    await bot.editMessageText(statsText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: backButton,
    });
    return;
  }

  if (data === "admin_users") {
    const users = await prisma.user.findMany({
      where: { isDeleted: false },
      select: {
        fullName: true,
        campusId: true,
        telegramUsername: true,
        telegramChatId: true,
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    });

    const userList = users.map((u, i) =>
      `${i + 1}. ${u.fullName} | ID: ${u.campusId || "None"} | @${u.telegramUsername || "n/a"}`
    ).join("\n") || "No registered users found.";

    await bot.sendMessage(chatId, `👥 *Registered Students (Latest 20):*\n\n${userList}`, {
      parse_mode: "Markdown",
    });
    return;
  }

  if (data === "admin_assignments") {
    await bot.sendMessage(chatId, "📤 *Select Submission Category:*", {
      parse_mode: "Markdown",
      reply_markup: adminAssignmentTypeKeyboard,
    });
    return;
  }

  if (data === "admin_individual_list" || data === "admin_group_list") {
    const subType = data === "admin_individual_list" ? "individual" : "group";
    const dir = path.resolve(process.cwd(), "storage", "assignments", subType);

    if (!fs.existsSync(dir)) {
      await bot.sendMessage(chatId, `No ${subType} submissions found.`);
      return;
    }

    const files = fs.readdirSync(dir).filter((f) => !f.startsWith("."));
    if (files.length === 0) {
      await bot.sendMessage(chatId, `No ${subType} submissions found.`);
      return;
    }

    // Limit to latest 5 to avoid Telegram API rate limit errors
    const latestFiles = files.slice(0, 5);
    await bot.sendMessage(chatId, `📦 Sending ${latestFiles.length} latest ${subType} submissions...`);

    for (const file of latestFiles) {
      const filePath = path.join(dir, file);
      try {
        await bot.sendDocument(chatId, fs.createReadStream(filePath));
      } catch (err) {
        console.error("Failed to stream document to admin:", err);
      }
    }
    return;
  }

  if (data === "admin_feedback") {
    const feedbacks = await prisma.feedback.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    if (feedbacks.length === 0) {
      await bot.sendMessage(chatId, "No feedback records found.");
      return;
    }

    const list = feedbacks.map((f, i) =>
      `#${i + 1} [Chat: ${f.chatId || "web"}]: ${f.content}`
    ).join("\n\n");

    await bot.sendMessage(chatId, `💬 *Recent Student Feedback:*\n\n${list}`, {
      parse_mode: "Markdown",
    });
    return;
  }
}
