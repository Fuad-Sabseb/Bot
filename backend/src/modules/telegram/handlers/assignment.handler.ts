import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { telegramState } from "../state";
import { sendMainMenu } from "./start.handler";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

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

    await bot.sendMessage(chatId, `✅ Uploaded successfully!\n📄 File: ${safeBaseName}`);
    telegramState.clearState(chatId);
    await sendMainMenu(bot, chatId);
  } catch (err) {
    console.error("Assignment upload error:", err);
    await bot.sendMessage(chatId, "❌ File upload failed. Please try again.");
  }
}
