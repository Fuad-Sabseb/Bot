import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { backButton } from "../keyboards";

export async function handleQuizzesCommand(
  bot: TelegramBot,
  chatId: number | bigint
): Promise<void> {
  try {
    const user = await prisma.user.findFirst({
      where: { telegramChatId: BigInt(chatId) },
      include: {
        enrollments: {
          where: { status: "ACTIVE" },
          select: { courseOfferingId: true },
        },
      },
    });

    const enrolledOfferingIds = user?.enrollments.map((e) => e.courseOfferingId) || [];

    const quizzes = await prisma.quiz.findMany({
      where: {
        isPublished: true,
        isArchived: false,
        ...(enrolledOfferingIds.length > 0 ? { courseOfferingId: { in: enrolledOfferingIds } } : {}),
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        courseOffering: { include: { course: true } },
        questions: true,
      },
    });

    if (quizzes.length === 0) {
      await bot.sendMessage(
        chatId.toString(),
        "🎯 *Course Quizzes*\n\nNo published quizzes are currently open for your courses.\nCheck back soon or practice with `/practice`!",
        { parse_mode: "Markdown", reply_markup: backButton }
      );
      return;
    }

    let text = `🎯 *Active Course Quizzes*\n\n`;
    quizzes.forEach((q, idx) => {
      text += `${idx + 1}. *${q.title}*\n`;
      text += `   📚 *Course:* ${q.courseOffering.course.code} - ${q.courseOffering.course.title}\n`;
      text += `   ⏱️ *Duration:* ${q.durationMin} mins | ❓ *Questions:* ${q.questions.length}\n`;
      text += `   🏆 *Passing Threshold:* ${q.passingScore}% | 🔄 *Max Attempts:* ${q.maxAttempts}\n\n`;
    });

    text += `🌐 _Log in to the web app to start your timed quiz attempt!_`;

    await bot.sendMessage(chatId.toString(), text, {
      parse_mode: "Markdown",
      reply_markup: backButton,
    });
  } catch (err: any) {
    console.error("Telegram Quizzes Error:", err.message);
    await bot.sendMessage(chatId.toString(), "⚠️ Could not load quizzes right now. Please try again later.");
  }
}

export async function handlePracticeCommand(
  bot: TelegramBot,
  chatId: number | bigint,
  topicQuery?: string
): Promise<void> {
  try {
    const where: any = { isDeleted: false };
    if (topicQuery && topicQuery.trim()) {
      where.OR = [
        { topic: { contains: topicQuery.trim(), mode: "insensitive" } },
        { chapter: { contains: topicQuery.trim(), mode: "insensitive" } },
        { prompt: { contains: topicQuery.trim(), mode: "insensitive" } },
      ];
    }

    const question = await prisma.practiceQuestion.findFirst({
      where,
      include: {
        courseOffering: { include: { course: true } },
        options: { orderBy: { orderIndex: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!question) {
      await bot.sendMessage(
        chatId.toString(),
        `❓ No practice questions found${topicQuery ? ` for "${topicQuery}"` : ""}.\nTry \`/practice\` without arguments to get a general question.`,
        { parse_mode: "Markdown", reply_markup: backButton }
      );
      return;
    }

    let msg = `🎯 *Practice Arena: ${question.courseOffering.course.code}*\n`;
    if (question.topic) msg += `🏷️ *Topic:* ${question.topic} | 📊 *Difficulty:* ${question.difficulty}\n\n`;
    msg += `*Question:*\n${question.prompt}\n\n`;

    const keyboardButtons: TelegramBot.InlineKeyboardButton[][] = [];

    if (question.options.length > 0) {
      question.options.forEach((opt, idx) => {
        keyboardButtons.push([
          {
            text: `${String.fromCharCode(65 + idx)}) ${opt.optionText}`,
            callback_data: `prac_ans_${opt.id}`,
          },
        ]);
      });
    }

    keyboardButtons.push([{ text: "⬅️ Back to Menu", callback_data: "back_menu" }]);

    await bot.sendMessage(chatId.toString(), msg, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboardButtons },
    });
  } catch (err: any) {
    console.error("Telegram Practice Command Error:", err.message);
    await bot.sendMessage(chatId.toString(), "⚠️ Could not retrieve practice questions.");
  }
}

export async function handleQuizCallback(
  bot: TelegramBot,
  chatId: number | bigint,
  messageId?: number,
  data?: string
): Promise<void> {
  if (data === "quizzes_menu") {
    let text = `🎯 *Academic Quizzes & Practice Arena*\n\n`;
    text += `Test your knowledge with formal timed quizzes or practice questions:\n\n`;
    text += `• \`/quizzes\` — List active quizzes for your courses\n`;
    text += `• \`/practice\` — Get an instant interactive practice question\n`;
    text += `• \`/practice <topic>\` — Practice questions for a specific topic\n\n`;
    text += `_Take formal quizzes with real-time scoring in the Web Dashboard._`;

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
  } else if (data && data.startsWith("prac_ans_")) {
    const optionId = data.replace("prac_ans_", "").trim();
    try {
      const option = await prisma.questionOption.findUnique({
        where: { id: optionId },
        include: { question: true },
      });

      if (!option) return;

      const icon = option.isCorrect ? "✅" : "❌";
      const statusText = option.isCorrect ? "*Correct Answer! Excellent job!*" : "*Incorrect Answer.*";
      let feedback = `${icon} ${statusText}\n\n`;
      if (option.question.explanation) {
        feedback += `💡 *Explanation:* ${option.question.explanation}\n\n`;
      }
      feedback += `_Try another question with \`/practice\`!_`;

      await bot.sendMessage(chatId.toString(), feedback, {
        parse_mode: "Markdown",
        reply_markup: backButton,
      });
    } catch (err: any) {
      console.error("Telegram Answer Callback Error:", err.message);
    }
  }
}
