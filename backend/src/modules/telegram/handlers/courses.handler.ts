import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { CourseRole } from "@prisma/client";
import { backButton } from "../keyboards";
import { buildPaginationButtons } from "../utils/pagination";

const COURSES_PER_PAGE = 5;

export async function handleCoursesCommand(
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
        include: {
          courseOffering: {
            include: {
              course: true,
              semester: true,
              class: true,
              courseRoles: {
                where: { role: { in: [CourseRole.INSTRUCTOR, CourseRole.LEAD_INSTRUCTOR] } },
                include: { user: true },
              },
            },
          },
        },
      },
      courseRoles: {
        where: { role: { in: [CourseRole.INSTRUCTOR, CourseRole.LEAD_INSTRUCTOR] } },
        include: {
          courseOffering: {
            include: {
              course: true,
              semester: true,
              class: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    const text =
      `📚 *My Enrolled Courses*\n\n` +
      `⚠️ Your Telegram account is not yet linked to a university student profile.\n\n` +
      `To synchronize your account:\n` +
      `1. Log in to the web platform.\n` +
      `2. Open your Profile / Settings.\n` +
      `3. Generate a 6-digit linking code.\n` +
      `4. Type \`/link <6-digit-otp>\` here.`;

    if (messageId) {
      await bot.editMessageText(text, {
        chat_id: numericChatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
      return;
    }
    await bot.sendMessage(numericChatId, text, {
      parse_mode: "Markdown",
      reply_markup: backButton,
    });
    return;
  }

  // Combine enrolled offerings and taught offerings
  interface CourseItem {
    id: string;
    code: string;
    title: string;
    className: string;
    semesterName: string;
    instructors: string;
    role: string;
  }

  const items: CourseItem[] = [];

  for (const enr of user.enrollments) {
    const off = enr.courseOffering;
    const instructors =
      off.courseRoles.map((cr) => cr.user.fullName).join(", ") || "Faculty Department";
    items.push({
      id: off.id,
      code: off.course.code,
      title: off.course.title,
      className: off.class.name,
      semesterName: off.semester.name,
      instructors,
      role: "Student",
    });
  }

  for (const cr of user.courseRoles) {
    const off = cr.courseOffering;
    if (!items.some((i) => i.id === off.id)) {
      items.push({
        id: off.id,
        code: off.course.code,
        title: off.course.title,
        className: off.class.name,
        semesterName: off.semester.name,
        instructors: user.fullName,
        role: "Instructor",
      });
    }
  }

  if (items.length === 0) {
    const emptyText =
      `📚 *My Courses*\n\n` +
      `👋 Hello *${user.fullName}* (${user.campusId || "Student"})\n\n` +
      `You are currently not enrolled in any active courses for this semester.\n` +
      `Please contact your academic advisor or class administrator to complete course registration.`;

    if (messageId) {
      await bot.editMessageText(emptyText, {
        chat_id: numericChatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
      return;
    }
    await bot.sendMessage(numericChatId, emptyText, {
      parse_mode: "Markdown",
      reply_markup: backButton,
    });
    return;
  }

  const totalPages = Math.ceil(items.length / COURSES_PER_PAGE);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * COURSES_PER_PAGE;
  const pagedItems = items.slice(startIndex, startIndex + COURSES_PER_PAGE);

  let text = `📚 *My Courses & Offerings* (${items.length} Total)\n`;
  text += `👤 *Student:* ${user.fullName} (${user.campusId || "Registered"})\n\n`;

  pagedItems.forEach((c, idx) => {
    const num = startIndex + idx + 1;
    text += `${num}. *[${c.code}] ${c.title}*\n`;
    text += `   🏛️ Class: ${c.className} | 📅 ${c.semesterName}\n`;
    text += `   👨‍🏫 Instructor: ${c.instructors}\n`;
    text += `   🏷️ Status: ${c.role}\n\n`;
  });

  const paginationRow = buildPaginationButtons("courses_page", safePage, totalPages);
  const inline_keyboard: TelegramBot.InlineKeyboardButton[][] = [];
  if (paginationRow.length > 0) {
    inline_keyboard.push(paginationRow);
  }
  inline_keyboard.push([{ text: "⬅️ Back to Menu", callback_data: "back_menu" }]);

  const options: TelegramBot.SendMessageOptions = {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard },
  };

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

  await bot.sendMessage(numericChatId, text, options);
}
