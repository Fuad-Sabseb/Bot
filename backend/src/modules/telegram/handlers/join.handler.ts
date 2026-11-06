import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../../database/prisma";
import { env } from "../../../config/env";
import { sendMainMenu } from "./start.handler";
import { telegramState } from "../state";

export async function handleJoinIdSubmission(
  bot: TelegramBot,
  chatId: number,
  campusIdInput: string
): Promise<void> {
  const cleanId = campusIdInput.trim();
  const bigIntChatId = BigInt(chatId);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Exact match check
      const entry = await tx.campusIdRegistry.findUnique({
        where: { campusId: cleanId },
      });

      if (!entry) {
        return { status: "INVALID" as const };
      }

      if (entry.isUsed) {
        return { status: "ALREADY_USED" as const };
      }

      // 2. Mark as used and associate with user if user exists
      const user = await tx.user.findUnique({
        where: { telegramChatId: bigIntChatId },
      });

      await tx.campusIdRegistry.update({
        where: { campusId: cleanId },
        data: {
          isUsed: true,
          usedByUserId: user?.id || null,
        },
      });

      if (user) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            campusId: cleanId,
            isVerified: true,
          },
        });
      }

      return { status: "SUCCESS" as const };
    });

    if (result.status === "INVALID") {
      await bot.sendMessage(chatId, "❌ Invalid ID. Your Campus ID was not found in the official registry.");
      return;
    }

    if (result.status === "ALREADY_USED") {
      await bot.sendMessage(chatId, "❌ Already used. This Campus ID has already been claimed.");
      return;
    }

    // 3. Generate One-Time Telegram Group Invite Link
    let inviteLink: string;
    try {
      const invite = await bot.createChatInviteLink(Number(env.TELEGRAM_GROUP_CHAT_ID), {
        member_limit: 1,
      });
      inviteLink = invite.invite_link;
    } catch (inviteErr) {
      console.error("Failed to generate Telegram invite link:", inviteErr);
      inviteLink = "[Group Invite Error: Please contact class administrator]";
    }

    await bot.sendMessage(chatId, `🎓 Join Link (Single Use):\n${inviteLink}`);
    telegramState.clearState(chatId);
    await sendMainMenu(bot, chatId);
  } catch (error) {
    console.error("Error processing Campus ID submission:", error);
    await bot.sendMessage(chatId, "❌ An error occurred while verifying your Campus ID. Please try again.");
  }
}
