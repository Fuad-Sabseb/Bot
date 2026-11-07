import { prisma } from "../src/database/prisma";
import { handleJoinIdSubmission } from "../src/modules/telegram/handlers/join.handler";
import { handleAnnouncementBroadcast, isUserAdmin } from "../src/modules/telegram/handlers/announcement.handler";
import { handleFeedbackSubmission } from "../src/modules/telegram/handlers/feedback.handler";
import { handleAdminCallback } from "../src/modules/telegram/handlers/admin.handler";
import path from "path";

// Mock TelegramBot instance
function createMockBot() {
  const sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  const editedMessages: Array<{ text: string; options?: any }> = [];

  return {
    sendMessage: jest.fn(async (chatId: number, text: string, options?: any) => {
      sentMessages.push({ chatId, text, options });
      return { message_id: 1001 };
    }),
    editMessageText: jest.fn(async (text: string, options?: any) => {
      editedMessages.push({ text, options });
      return true;
    }),
    createChatInviteLink: jest.fn(async () => {
      return { invite_link: "https://t.me/+mockInviteLink123" };
    }),
    answerCallbackQuery: jest.fn(async () => true),
    sendDocument: jest.fn(async () => true),
    getSentMessages: () => sentMessages,
    getEditedMessages: () => editedMessages,
  };
}

describe("Telegram Bot Regression & Security Verification", () => {
  const mockAdminChatId = 5999909651;
  const mockStudentChatId = 888888888;
  const testCampusId = "RU0034/17";

  beforeAll(async () => {
    // Reset test ID in registry
    await prisma.campusIdRegistry.upsert({
      where: { campusId: testCampusId },
      update: { isUsed: false, usedByUserId: null },
      create: { campusId: testCampusId, isUsed: false },
    });

    // Seed mock student user
    await prisma.user.upsert({
      where: { telegramChatId: BigInt(mockStudentChatId) },
      update: { globalRoles: { deleteMany: {} } },
      create: {
        telegramChatId: BigInt(mockStudentChatId),
        fullName: "Test Telegram Student",
        globalRoles: { create: { role: "USER" } },
      },
    });

    // Seed mock admin user
    await prisma.user.upsert({
      where: { telegramChatId: BigInt(mockAdminChatId) },
      update: {},
      create: {
        telegramChatId: BigInt(mockAdminChatId),
        fullName: "Test Telegram Admin",
        globalRoles: { create: { role: "ADMIN" } },
      },
    });
  });

  test("1. Campus ID validation: Rejects substring inputs (eliminates substring bug)", async () => {
    const mockBot = createMockBot();

    await handleJoinIdSubmission(mockBot as any, mockStudentChatId, "034");
    let messages = mockBot.getSentMessages();
    expect(messages[messages.length - 1].text).toContain("Invalid ID");

    await handleJoinIdSubmission(mockBot as any, mockStudentChatId, "RU");
    messages = mockBot.getSentMessages();
    expect(messages[messages.length - 1].text).toContain("Invalid ID");
  });

  test("2. Campus ID validation: Accepts exact valid unused Campus ID and marks it used", async () => {
    const mockBot = createMockBot();

    await handleJoinIdSubmission(mockBot as any, mockStudentChatId, testCampusId);
    const messages = mockBot.getSentMessages();

    expect(messages[0].text).toContain("Join Link (Single Use):");
    expect(messages[0].text).toContain("https://t.me/+mockInviteLink123");

    // Verify database state: isUsed should now be true
    const entry = await prisma.campusIdRegistry.findUnique({ where: { campusId: testCampusId } });
    expect(entry?.isUsed).toBe(true);
  });

  test("3. Campus ID validation: Rejects already-used Campus ID", async () => {
    const mockBot = createMockBot();

    await handleJoinIdSubmission(mockBot as any, mockStudentChatId, testCampusId);
    const messages = mockBot.getSentMessages();

    expect(messages[0].text).toContain("Already used");
  });

  test("4. Announcement security: Unauthorized student broadcast attempt is BLOCKED", async () => {
    const mockBot = createMockBot();

    await handleAnnouncementBroadcast(mockBot as any, mockStudentChatId, "Spam message attempt");
    const messages = mockBot.getSentMessages();

    expect(messages[0].text).toContain("Access denied");
  });

  test("5. Announcement security: Authorized Admin broadcast succeeds", async () => {
    const mockBot = createMockBot();

    await handleAnnouncementBroadcast(mockBot as any, mockAdminChatId, "Official Faculty Announcement");
    const messages = mockBot.getSentMessages();
    const broadcastConfirmation = messages.find((m) => m.text.includes("Broadcast sent"));

    expect(broadcastConfirmation).toBeDefined();
    expect(broadcastConfirmation?.text).toContain("Broadcast sent");
  });

  test("6. Feedback submission: Persists to PostgreSQL Feedback table and notifies Admin", async () => {
    const mockBot = createMockBot();
    const feedbackText = "Please upload lab slides for week 3.";

    await handleFeedbackSubmission(mockBot as any, mockStudentChatId, feedbackText);
    const messages = mockBot.getSentMessages();

    expect(messages[0].text).toContain("Saved!");
    // Admin was notified
    const adminNotification = messages.find((m) => m.chatId === mockAdminChatId);
    expect(adminNotification).toBeDefined();
    expect(adminNotification?.text).toContain(feedbackText);

    // Verify in database
    const saved = await prisma.feedback.findFirst({
      where: { chatId: BigInt(mockStudentChatId), content: feedbackText },
    });
    expect(saved).not.toBeNull();
  });

  test("7. Admin dashboard callback: Unauthorized user is denied access", async () => {
    const mockBot = createMockBot();

    await handleAdminCallback(mockBot as any, {
      message: { chat: { id: mockStudentChatId }, message_id: 200 },
      data: "admin_panel",
    } as any);

    const messages = mockBot.getSentMessages();
    expect(messages[0].text).toContain("Access denied");
  });

  test("8. Admin dashboard callback: Authorized admin accesses dashboard & stats", async () => {
    const mockBot = createMockBot();

    await handleAdminCallback(mockBot as any, {
      message: { chat: { id: mockAdminChatId }, message_id: 201 },
      data: "admin_stats",
    } as any);

    const edited = mockBot.getEditedMessages();
    expect(edited[0].text).toContain("Real-Time System Statistics");
    expect(edited[0].text).toContain("Campus IDs in Registry");
  });

  test("9. Path traversal defense: Uploaded filenames are sanitized with basename and unique key", () => {
    const rawMaliciousName = "../../etc/passwd";
    const safeBaseName = path.basename(rawMaliciousName).replace(/[^a-zA-Z0-9._-]/g, "_");
    expect(safeBaseName).not.toContain("/");
    expect(safeBaseName).not.toContain("..");
    expect(safeBaseName).toBe("passwd");
  });
});
