import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { ModerationStatus } from "@prisma/client";
import { backButton } from "../keyboards";

export async function handleBlogCommand(
  bot: TelegramBot,
  chatId: number | bigint,
  searchQuery?: string
): Promise<void> {
  try {
    const where: any = {
      isDeleted: false,
      status: ModerationStatus.APPROVED,
    };

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
        { tags: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ];
    }

    const posts = await prisma.blogPost.findMany({
      where,
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { fullName: true, campusId: true } },
        _count: {
          select: {
            likes: true,
            comments: { where: { isDeleted: false } },
          },
        },
      },
    });

    if (posts.length === 0) {
      await bot.sendMessage(
        chatId.toString(),
        `✍️ *Student Blog & Community*\n\nNo published articles found${searchQuery ? ` matching "${searchQuery}"` : ""}.\nShare your ideas or technical tutorials on the Web App!`,
        { parse_mode: "Markdown", reply_markup: backButton }
      );
      return;
    }

    let text = `✍️ *Student Academic Blog & Ideas*${searchQuery ? `\n_Search results for "${searchQuery}":_` : ""}\n\n`;

    const buttons: TelegramBot.InlineKeyboardButton[][] = [];

    posts.forEach((p, idx) => {
      text += `${idx + 1}. *${p.title}*\n`;
      text += `   🏷️ *Category:* ${p.category} | ✍️ *By:* ${p.author.fullName}\n`;
      text += `   👁️ ${p.views} views | ❤️ ${p._count.likes} likes | 💬 ${p._count.comments} comments\n\n`;

      buttons.push([
        {
          text: `📖 Read: ${p.title.slice(0, 30)}${p.title.length > 30 ? "..." : ""}`,
          callback_data: `blog_read_${p.id}`,
        },
      ]);
    });

    text += `🌐 _Read full articles, comment, and publish your own on the Web App!_`;

    buttons.push([{ text: "⬅️ Back to Menu", callback_data: "back_menu" }]);

    await bot.sendMessage(chatId.toString(), text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (err: any) {
    console.error("Telegram Blog Command Error:", err.message);
    await bot.sendMessage(chatId.toString(), "⚠️ Could not retrieve blog articles. Please try again later.");
  }
}

export async function handleBlogCallback(
  bot: TelegramBot,
  chatId: number | bigint,
  messageId?: number,
  data?: string
): Promise<void> {
  if (data === "community_blog") {
    return handleBlogCommand(bot, chatId);
  } else if (data && data.startsWith("blog_read_")) {
    const postId = data.replace("blog_read_", "").trim();
    try {
      const post = await prisma.blogPost.findUnique({
        where: { id: postId },
        include: {
          author: { select: { fullName: true, campusId: true } },
          _count: {
            select: {
              likes: true,
              comments: { where: { isDeleted: false } },
            },
          },
        },
      });

      if (!post || post.isDeleted || post.status !== ModerationStatus.APPROVED) {
        await bot.sendMessage(chatId.toString(), "⚠️ This article is no longer available.");
        return;
      }

      // Increment view counter
      await prisma.blogPost.update({
        where: { id: post.id },
        data: { views: { increment: 1 } },
      });

      let text = `📰 *${post.title}*\n`;
      text += `🏷️ *Category:* ${post.category}\n`;
      text += `✍️ *Author:* ${post.author.fullName} (${post.author.campusId})\n`;
      text += `📅 *Date:* ${post.createdAt.toISOString().slice(0, 10)}\n`;
      text += `👁️ ${post.views + 1} views | ❤️ ${post._count.likes} likes | 💬 ${post._count.comments} comments\n\n`;

      // Snippet of content
      const snippet = post.content.slice(0, 600);
      text += `*Summary:*\n${snippet}${post.content.length > 600 ? "...\n\n_Read the complete article on the Campus Web App!_" : ""}`;

      await bot.sendMessage(chatId.toString(), text, {
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
    } catch (err: any) {
      console.error("Telegram Blog Read Callback Error:", err.message);
    }
  }
}
