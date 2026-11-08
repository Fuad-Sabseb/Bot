import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { backButton } from "../keyboards";
import { buildPaginationButtons } from "../utils/pagination";

const MATERIALS_PER_PAGE = 5;

export async function handleMaterialsCommand(
  bot: TelegramBot,
  chatId: number | bigint,
  query?: string,
  page = 1,
  messageId?: number
): Promise<void> {
  const numericChatId = typeof chatId === "bigint" ? Number(chatId) : chatId;
  const bigIntId = BigInt(chatId);

  // Look up user to see if we can tailor to enrolled courses
  const user = await prisma.user.findUnique({
    where: { telegramChatId: bigIntId },
    include: {
      enrollments: {
        where: { status: "ACTIVE" },
        select: { courseOfferingId: true },
      },
    },
  });

  const enrolledOfferingIds = user?.enrollments.map((e) => e.courseOfferingId) || [];

  const whereClause: any = {
    status: "APPROVED",
    isDeleted: false,
  };

  // If student is enrolled in offerings, prioritize them unless a query is specified
  if (enrolledOfferingIds.length > 0 && !query) {
    whereClause.courseOfferingId = { in: enrolledOfferingIds };
  }

  if (query && query.trim()) {
    const q = query.trim();
    whereClause.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { contains: q, mode: "insensitive" } },
      { fileName: { contains: q, mode: "insensitive" } },
      { courseOffering: { course: { code: { contains: q, mode: "insensitive" } } } },
      { courseOffering: { course: { title: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [totalCount, materials] = await Promise.all([
    prisma.learningMaterial.count({ where: whereClause }),
    prisma.learningMaterial.findMany({
      where: whereClause,
      include: {
        courseOffering: {
          include: {
            course: true,
            class: true,
          },
        },
        uploader: {
          select: { fullName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: Math.max(0, (page - 1) * MATERIALS_PER_PAGE),
      take: MATERIALS_PER_PAGE,
    }),
  ]);

  if (totalCount === 0) {
    const emptyMsg = query
      ? `📖 *Study Materials Search*\n\nNo learning materials matched "*${query}*". Try another topic, course code, or keyword.`
      : `📖 *Study Materials*\n\nNo learning materials have been published yet for your courses. Check back soon or search using \`/materials <keyword>\`.`;

    if (messageId) {
      await bot.editMessageText(emptyMsg, {
        chat_id: numericChatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
      return;
    }
    await bot.sendMessage(numericChatId, emptyMsg, {
      parse_mode: "Markdown",
      reply_markup: backButton,
    });
    return;
  }

  const totalPages = Math.ceil(totalCount / MATERIALS_PER_PAGE);
  const safePage = Math.min(Math.max(1, page), totalPages);

  let text = `📖 *Study Materials & Course Resources* (${totalCount} Total)\n`;
  if (query) {
    text += `🔍 Filter: "*${query}*"\n`;
  }
  text += "\n";

  materials.forEach((m, idx) => {
    const num = (safePage - 1) * MATERIALS_PER_PAGE + idx + 1;
    const sizeMb = (m.fileSize / (1024 * 1024)).toFixed(2);
    text += `${num}. *[${m.courseOffering.course.code}] ${m.title}*\n`;
    text += `   🏷️ Category: ${m.category} | 📦 Size: ${sizeMb} MB\n`;
    text += `   👤 Uploader: ${m.uploader.fullName} | ⬇️ Downloads: ${m.downloads}\n`;
    if (m.tags) {
      text += `   🏷️ Tags: \`${m.tags}\`\n`;
    }
    text += `   📄 File: \`${m.fileName}\`\n\n`;
  });

  const paginationRow = buildPaginationButtons("mat_page", safePage, totalPages);
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
