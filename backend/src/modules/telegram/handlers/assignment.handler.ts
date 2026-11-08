import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../../../database/prisma";
import { telegramState } from "../state";
import { sendMainMenu } from "./start.handler";
import { assignmentMenuKeyboard, backButton } from "../keyboards";
import { buildPaginationButtons } from "../utils/pagination";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ASSIGNMENTS_PER_PAGE = 4;

export async function handleAssignmentsCommand(
  bot: TelegramBot,
  chatId: number | bigint,
  page = 1,
  messageId?: number
): Promise<void> {
  const numericChatId = typeof chatId === "bigint" ? Number(chatId) : chatId;
  const bigIntId = BigInt(chatId);

  const user = await prisma.user.findUnique({
    where: { telegramChatId: bigIntId },
    include: {
      enrollments: {
        where: { status: "ACTIVE" },
        select: { courseOfferingId: true },
      },
      submissions: {
        where: { isCurrentVersion: true },
        select: {
          assignmentId: true,
          status: true,
          version: true,
          grade: true,
          gradedAt: true,
        },
      },
      groupMemberships: {
        include: {
          group: {
            include: {
              submissions: {
                where: { isCurrentVersion: true },
                select: {
                  assignmentId: true,
                  status: true,
                  grade: true,
                  gradedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    const text =
      `📤 *Course Assignments*\n\n` +
      `⚠️ Your Telegram account is not yet linked to a university student profile.\n\n` +
      `Link your account via \`/link <6-digit-otp>\` to access deadlines and view submission status.`;

    if (messageId) {
      await bot.editMessageText(text, {
        chat_id: numericChatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: assignmentMenuKeyboard,
      });
      return;
    }
    await bot.sendMessage(numericChatId, text, {
      parse_mode: "Markdown",
      reply_markup: assignmentMenuKeyboard,
    });
    return;
  }

  const enrolledOfferingIds = user.enrollments.map((e) => e.courseOfferingId);

  const assignments = await prisma.assignment.findMany({
    where: {
      courseOfferingId: { in: enrolledOfferingIds },
      isArchived: false,
    },
    include: {
      courseOffering: {
        include: {
          course: true,
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  if (assignments.length === 0) {
    const emptyText =
      `📤 *Assignments & Submissions*\n\n` +
      `🎉 You have no active assignments due for your enrolled courses!\n\n` +
      `You can still submit files manually if required by your instructor.`;

    if (messageId) {
      await bot.editMessageText(emptyText, {
        chat_id: numericChatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: assignmentMenuKeyboard,
      });
      return;
    }
    await bot.sendMessage(numericChatId, emptyText, {
      parse_mode: "Markdown",
      reply_markup: assignmentMenuKeyboard,
    });
    return;
  }

  const totalPages = Math.ceil(assignments.length / ASSIGNMENTS_PER_PAGE);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * ASSIGNMENTS_PER_PAGE;
  const paged = assignments.slice(startIndex, startIndex + ASSIGNMENTS_PER_PAGE);

  const now = Date.now();
  let text = `📤 *Academic Assignments* (${assignments.length} Total)\n`;
  text += `👤 *Student:* ${user.fullName} (${user.campusId || "Enrolled"})\n\n`;

  paged.forEach((a, idx) => {
    const num = startIndex + idx + 1;
    const dueTime = a.dueDate.getTime();
    const diffHours = Math.round((dueTime - now) / (1000 * 60 * 60));

    let deadlineNotice = "";
    if (diffHours < 0) {
      deadlineNotice = "❌ *DEADLINE PASSED*";
    } else if (diffHours <= 2) {
      deadlineNotice = `🔥 *Due in ${Math.max(1, Math.round((dueTime - now) / 60000))} minutes!*`;
    } else if (diffHours <= 24) {
      deadlineNotice = `⚠️ *Due today (${diffHours} hours remaining)*`;
    } else {
      const days = Math.round(diffHours / 24);
      deadlineNotice = `📅 Due in ${days} day${days > 1 ? "s" : ""}`;
    }

    // Check submission status
    let submissionInfo = "⏳ Pending Submission";
    if (a.type === "INDIVIDUAL") {
      const sub = user.submissions.find((s) => s.assignmentId === a.id);
      if (sub) {
        submissionInfo =
          sub.grade !== null
            ? `✅ Graded: ${sub.grade}/${a.maxMarks || 100} pts`
            : `✅ Submitted (v${sub.version || 1})`;
      }
    } else {
      const groupSub = user.groupMemberships
        .map((m) => m.group.submissions.find((s) => s.assignmentId === a.id))
        .find(Boolean);
      if (groupSub) {
        submissionInfo =
          groupSub.grade !== null
            ? `✅ Graded (Group): ${groupSub.grade}/${a.maxMarks || 100} pts`
            : `✅ Submitted by Group`;
      }
    }

    text += `${num}. *[${a.courseOffering.course.code}] ${a.title}*\n`;
    text += `   🏷️ Type: ${a.type} | Max Marks: ${a.maxMarks || 100}\n`;
    text += `   ⏰ ${deadlineNotice}\n`;
    text += `   📌 Status: ${submissionInfo}\n\n`;
  });

  const paginationRow = buildPaginationButtons("assign_page", safePage, totalPages);
  const inline_keyboard: TelegramBot.InlineKeyboardButton[][] = [];
  if (paginationRow.length > 0) {
    inline_keyboard.push(paginationRow);
  }
  inline_keyboard.push([
    { text: "📄 Submit Individual", callback_data: "assignment_individual" },
    { text: "👥 Submit Group", callback_data: "assignment_group" },
  ]);
  inline_keyboard.push([{ text: "⬅️ Back to Menu", callback_data: "back_menu" }]);

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: numericChatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard },
      });
      return;
    } catch {
      // Fallback
    }
  }

  await bot.sendMessage(numericChatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard },
  });
}

export async function handleDocumentUpload(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  const chatId = msg.chat.id;
  const state = telegramState.getState(chatId);

  if (!msg.document || (state !== "assignment_individual" && state !== "assignment_group")) {
    return;
  }

  const { file_id, file_name, file_size } = msg.document;

  if (file_size && file_size > MAX_FILE_SIZE_BYTES) {
    await bot.sendMessage(chatId, "❌ File exceeds maximum permitted size of 50MB.");
    return;
  }

  const subType = state === "assignment_individual" ? "individual" : "group";
  const targetDir = path.resolve(process.cwd(), "storage", "assignments", subType);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  try {
    // Generate secure randomized storage key to prevent collisions and path traversal
    const safeBaseName = path.basename(file_name || "submission.dat").replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueKey = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeBaseName}`;
    const destinationPath = path.join(targetDir, uniqueKey);

    // Download document safely
    const tempPath = await bot.downloadFile(file_id, targetDir);
    fs.renameSync(tempPath, destinationPath);

    await bot.sendMessage(chatId, `✅ Uploaded successfully!\n📄 File: *${safeBaseName}*`, {
      parse_mode: "Markdown",
    });
    telegramState.clearState(chatId);
    await sendMainMenu(bot, chatId);
  } catch (err) {
    console.error("Assignment upload error:", err);
    await bot.sendMessage(chatId, "❌ File upload failed. Please try again.");
  }
}
