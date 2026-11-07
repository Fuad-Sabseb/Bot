export type TelegramUserState =
  | "menu"
  | "join_waiting_id"
  | "assignment_individual"
  | "assignment_group"
  | "announcement_waiting_text"
  | "feedback_waiting_text";

/**
 * Persistent Conversation State Manager for Telegram Users.
 * Encapsulated to permit Redis/PostgreSQL backend storage.
 */
class TelegramStateManager {
  private states = new Map<bigint, TelegramUserState>();

  setState(chatId: bigint | number, state: TelegramUserState): void {
    this.states.set(BigInt(chatId), state);
  }

  getState(chatId: bigint | number): TelegramUserState | undefined {
    return this.states.get(BigInt(chatId));
  }

  clearState(chatId: bigint | number): void {
    this.states.delete(BigInt(chatId));
  }
}

export const telegramState = new TelegramStateManager();
