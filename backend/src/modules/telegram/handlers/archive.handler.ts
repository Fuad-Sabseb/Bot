import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { backButton } from "../keyboards";

export async function handleArchiveCommand(
  bot: TelegramBot,
  chatId: number | bigint,
  queryText?: string
): Promise<void> {
  try {
    const q = queryText?.trim();
    const where: any = { isDeleted: false, status: "APPROVED" };

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { tags: { contains: q, mode: "insensitive" } },
        { courseOffering: { course: { title: { contains: q, mode: "insensitive" } } } },
        { courseOffering: { course: { code: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const items = await prisma.archivedResource.findMany({
      where,
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        courseOffering: {
          include: {
            course: true,
          },
        },
      },
    });

    if (items.length === 0) {
      await bot.sendMessage(
        chatId.toString(),
        `🏛️ *Academic Archive*\n\nNo resources found${q ? ` matching "*${q}*"` : ""}.\n\nTry searching with a course code or keyword: \`/archive CS101\` or \`/past_exams midterm\`.`,
        { parse_mode: "Markdown", reply_markup: backButton }
      );
      return;
    }

    let response = `🏛️ *Academic Archive & Past Exams*\n`;
    if (q) response += `_Search results for:_ "${q}"\n\n`;
    else response += `_Latest approved resources:_\n\n`;

    items.forEach((item, index) => {
      const icon = item.resourceType === "PAST_EXAM" ? "📝" : item.resourceType === "PROJECT" ? "💻" : "💡";
      const officialBadge = item.isOfficial ? "⭐ *Official Solution*" : "👤 Student Reference";
      const yearStr = item.examYear ? ` (${item.examYear})` : "";
      const typeStr = item.assessmentType ? ` [${item.assessmentType}]` : ` [${item.resourceType}]`;

      response += `${index + 1}. ${icon} *${item.title}*${yearStr}\n`;
      response += `   📚 *Course:* ${item.courseOffering.course.code} - ${item.courseOffering.course.title}\n`;
      response += `   🏷️ *Type:* ${typeStr} | ${officialBadge}\n`;
      response += `   💾 *File:* \`${item.fileName}\` (${Math.round(item.fileSize / 1024)} KB) | ⬇️ ${item.downloads} downloads\n\n`;
    });

    response += `🌐 _View details & download via the Web Dashboard Archive tab._\n`;
    response += `🔍 _Refine search: \`/archive <query>\` or \`/past_exams <subject>\`_`;

    await bot.sendMessage(chatId.toString(), response, {
      parse_mode: "Markdown",
      reply_markup: backButton,
    });
  } catch (err: any) {
    console.error("Telegram Archive Handler Error:", err.message);
    await bot.sendMessage(chatId.toString(), "⚠️ Could not retrieve archive materials right now. Please try again later.");
  }
}

export async function handleArchiveCallback(
  bot: TelegramBot,
  chatId: number | bigint,
  messageId?: number
): Promise<void> {
  try {
    const items = await prisma.archivedResource.findMany({
      where: { isDeleted: false, status: "APPROVED" },
      take: 4,
      orderBy: { downloads: "desc" },
      include: {
        courseOffering: {
          include: {
            course: true,
          },
        },
      },
    });

    let text = `🏛️ *University Academic Archive*\n\nAccess past examinations, student projects, research archives, and official department solutions.\n\n`;

    if (items.length > 0) {
      text += `🔥 *Most Downloaded Resources:*\n`;
      items.forEach((item, index) => {
        const badge = item.isOfficial ? "⭐ Official" : "👤 Reference";
        text += `${index + 1}. *${item.title}* (${item.courseOffering.course.code}) — ${badge} (⬇️ ${item.downloads})\n`;
      });
      text += `\n`;
    }

    text += `🔎 *Quick Commands:*\n`;
    text += `• \`/archive <query>\` — Search all archive materials\n`;
    text += `• \`/past_exams <course>\` — Search previous exam papers\n`;
    text += `• Log in to the web app to upload past papers or project files!`;

    if (messageId) {
      await bot.editMessageText(text, {
        chat_id: chatId.toString(),
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
    } else {
      await bot.sendMessage(chatId.toString(), text, {
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
    }
  } catch (err: any) {
    console.error("Telegram Archive Callback Error:", err.message);
    if (messageId) {
      await bot.editMessageText("⚠️ Unable to load archive right now.", {
        chat_id: chatId.toString(),
        message_id: messageId,
        reply_markup: backButton,
      });
    }
  }
}
