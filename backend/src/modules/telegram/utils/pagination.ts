import TelegramBot from "node-telegram-bot-api";

export function buildPaginationButtons(
  prefix: string,
  currentPage: number,
  totalPages: number
): TelegramBot.InlineKeyboardButton[] {
  if (totalPages <= 1) return [];

  const row: TelegramBot.InlineKeyboardButton[] = [];

  if (currentPage > 1) {
    row.push({ text: "⬅️ Prev", callback_data: `${prefix}_${currentPage - 1}` });
  }

  row.push({ text: `Page ${currentPage}/${totalPages}`, callback_data: "noop" });

  if (currentPage < totalPages) {
    row.push({ text: "Next ➡️", callback_data: `${prefix}_${currentPage + 1}` });
  }

  return row;
}
