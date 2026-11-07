import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { AIService } from "../../ai/ai.service";
import { backButton } from "../keyboards";

export async function handleAICommand(
  bot: TelegramBot,
  chatId: number | bigint,
  prompt?: string
): Promise<void> {
  try {
    const user = await prisma.user.findFirst({
      where: { telegramChatId: BigInt(chatId) },
    });

    if (!user) {
      await bot.sendMessage(
        chatId.toString(),
        "🔒 *Authentication Required*\n\nPlease link your Telegram account to your Campus ID using the main menu before using the AI Academic Assistant.",
        { parse_mode: "Markdown", reply_markup: backButton }
      );
      return;
    }

    if (!prompt || !prompt.trim()) {
      let helpText = `🤖 *AI Academic Assistant*\n\n`;
      helpText += `Ask me any academic question, request code debugging, mathematical derivations, or study plans!\n\n`;
      helpText += `*Examples:*\n`;
      helpText += `• \`/ai Explain quicksort time complexity\`\n`;
      helpText += `• \`/ai Solve: find derivative of f(x) = x^2 * ln(x)\`\n`;
      helpText += `• \`/ai Create a 5-day exam study plan for Database Systems\`\n`;
      helpText += `• \`/ai Summarize key concepts from operating systems\`\n\n`;
      helpText += `_Answers are grounded in approved course materials when available._`;

      await bot.sendMessage(chatId.toString(), helpText, {
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
      return;
    }

    // Send typing status
    try {
      await bot.sendChatAction(chatId.toString(), "typing");
    } catch {
      // Ignore
    }

    const result = await AIService.askAssistant(user.id, prompt.trim());

    let responseText = `${result.answer}\n\n`;
    if (result.sources && result.sources.length > 0) {
      responseText += `📚 *Grounded Sources:*\n`;
      result.sources.forEach((s) => {
        responseText += `• ${s}\n`;
      });
      responseText += `\n`;
    }

    responseText += `⚡ _Tokens: ${result.tokensUsed} | Daily Quota Remaining: ${result.dailyRemaining} tokens_`;

    await bot.sendMessage(chatId.toString(), responseText, {
      parse_mode: "Markdown",
      reply_markup: backButton,
    });
  } catch (err: any) {
    console.error("Telegram AI Command Error:", err.message);
    if (err.message.startsWith("QUOTA_EXCEEDED")) {
      await bot.sendMessage(
        chatId.toString(),
        "⚠️ *Daily AI Token Limit Exceeded*\n\nYou have reached your daily token quota. Your quota resets in 24 hours.",
        { parse_mode: "Markdown", reply_markup: backButton }
      );
    } else {
      await bot.sendMessage(
        chatId.toString(),
        "⚠️ Could not process AI query. Please try again later.",
        { reply_markup: backButton }
      );
    }
  }
}

export async function handleAICallback(
  bot: TelegramBot,
  chatId: number | bigint,
  messageId?: number
): Promise<void> {
  let text = `🤖 *AI Academic Assistant & RAG Engine*\n\n`;
  text += `Get instant 24/7 academic assistance directly in Telegram:\n\n`;
  text += `• \`/ai <question>\` — Ask questions, get code help, or math solutions\n`;
  text += `• \`/ask <question>\` — Fast alias for quick questions\n\n`;
  text += `🌐 *Web Chat Interface:*\n`;
  text += `For multi-turn conversation history, document-grounded question answering, and study plan generators, visit the **AI Assistant** tab in the Web Dashboard!`;

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
}
