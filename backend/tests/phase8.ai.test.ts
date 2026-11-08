import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { generateAccessToken } from "../src/utils/jwt";
import { handleAICommand } from "../src/modules/telegram/handlers/ai.handler";

const app = createApp();

describe("Phase 8 — AI Academic Assistant & Document Intelligence (RAG)", () => {
  let adminToken: string;
  let adminUser: any;
  let student1Token: string;
  let student1User: any;
  let student2Token: string;
  let student2User: any;

  let offeringId: string;
  let materialId: string;
  let student1ConversationId: string;

  beforeAll(async () => {
    const timestamp = Date.now();

    // Clean any prior p8 test users
    const priorP8Users = await prisma.user.findMany({
      where: { email: { contains: "_p8_" } },
      select: { id: true },
    });
    if (priorP8Users.length > 0) {
      const pIds = priorP8Users.map((u) => u.id);
      await prisma.aIUsageRecord.deleteMany({ where: { userId: { in: pIds } } });
      await prisma.aIUserQuota.deleteMany({ where: { userId: { in: pIds } } });
      await prisma.aIConversation.deleteMany({ where: { userId: { in: pIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: pIds } } });
      await prisma.userGlobalRole.deleteMany({ where: { userId: { in: pIds } } });
      await prisma.user.deleteMany({ where: { id: { in: pIds } } });
    }

    // 1. Admin
    adminUser = await prisma.user.create({
      data: {
        fullName: "Dr. Norbert Wiener",
        email: `wiener_p8_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "ADMIN" } },
      },
    });
    const adminSession = await prisma.session.create({ data: { userId: adminUser.id } });
    adminToken = generateAccessToken({ userId: adminUser.id, sessionId: adminSession.id });

    // 2. Student 1
    student1User = await prisma.user.create({
      data: {
        fullName: "Claude Shannon",
        email: `shannon_p8_${timestamp}@university.edu`,
        campusId: `RU8001/${timestamp.toString().slice(-4)}`,
        isActive: true,
        telegramChatId: BigInt(timestamp + 2001),
        globalRoles: { create: { role: "USER" } },
      },
    });
    const student1Session = await prisma.session.create({ data: { userId: student1User.id } });
    student1Token = generateAccessToken({ userId: student1User.id, sessionId: student1Session.id });

    // 3. Student 2
    student2User = await prisma.user.create({
      data: {
        fullName: "Ada Lovelace",
        email: `lovelace_p8_${timestamp}@university.edu`,
        campusId: `RU8002/${timestamp.toString().slice(-4)}`,
        isActive: true,
        telegramChatId: BigInt(timestamp + 2002),
        globalRoles: { create: { role: "USER" } },
      },
    });
    const student2Session = await prisma.session.create({ data: { userId: student2User.id } });
    student2Token = generateAccessToken({ userId: student2User.id, sessionId: student2Session.id });

    // 4. Academic course & material for RAG
    const academicYear = await prisma.academicYear.create({
      data: {
        name: `AY8_${timestamp}`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
      },
    });

    const semester = await prisma.semester.create({
      data: {
        academicYearId: academicYear.id,
        semesterNumber: 1,
        name: `Semester 1 (AY8_${timestamp})`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-01-31"),
      },
    });

    const classCohort = await prisma.class.create({
      data: {
        name: `Info Cohort_${timestamp}`,
        code: `INF-${timestamp.toString().slice(-4)}`,
        department: "Computer Science",
        academicYearId: academicYear.id,
      },
    });

    const course = await prisma.course.create({
      data: {
        code: `INF801-${timestamp.toString().slice(-4)}`,
        title: "Information Theory & Entropy",
        credits: 4,
      },
    });

    const offering = await prisma.courseOffering.create({
      data: {
        courseId: course.id,
        semesterId: semester.id,
        classId: classCohort.id,
      },
    });
    offeringId = offering.id;

    // Enroll student 1
    await prisma.enrollment.create({
      data: { userId: student1User.id, courseOfferingId: offeringId, status: "ACTIVE" },
    });

    // Create approved learning material
    const mat = await prisma.learningMaterial.create({
      data: {
        courseOfferingId: offeringId,
        uploaderId: adminUser.id,
        title: "Entropy, Noisy Channel Coding and Information Capacity",
        description: "Official comprehensive lecture notes on Claude Shannon's mathematical theory of communication.",
        category: "LECTURE_NOTES",
        fileKey: "materials/test_entropy.pdf",
        fileUrl: "/storage/materials/test_entropy.pdf",
        fileName: "test_entropy.pdf",
        fileSize: 1024,
        fileSha256: "aabbcc112233",
        mimeType: "application/pdf",
        status: "APPROVED",
      },
    });
    materialId = mat.id;
  });

  afterAll(async () => {
    // Cleanup
    if (student1User && student2User && adminUser) {
      const uIds = [student1User.id, student2User.id, adminUser.id];
      await prisma.documentChunk.deleteMany({ where: { materialId } });
      await prisma.learningMaterial.deleteMany({ where: { id: materialId } });
      await prisma.enrollment.deleteMany({ where: { userId: { in: uIds } } });
      await prisma.aIUsageRecord.deleteMany({ where: { userId: { in: uIds } } });
      await prisma.aIUserQuota.deleteMany({ where: { userId: { in: uIds } } });
      await prisma.aIConversation.deleteMany({ where: { userId: { in: uIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: uIds } } });
      await prisma.userGlobalRole.deleteMany({ where: { userId: { in: uIds } } });
      await prisma.user.deleteMany({ where: { id: { in: uIds } } });
    }
  });

  // ==========================================
  // 1. QUOTA PROVISIONING & RETRIEVAL
  // ==========================================

  it("1. Student retrieves quota: auto-provisions with 50,000 daily and 1,000,000 monthly limit", async () => {
    const res = await request(app)
      .get("/api/v1/ai/quota")
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dailyTokenLimit).toBe(50000);
    expect(res.body.data.dailyTokensUsed).toBe(0);
    expect(res.body.data.dailyRemaining).toBe(50000);
    expect(res.body.data.monthlyTokenLimit).toBe(1000000);
  });

  // ==========================================
  // 2. CONVERSATION MANAGEMENT & THREADS
  // ==========================================

  it("2. Student creates a new AI conversation thread", async () => {
    const res = await request(app)
      .post("/api/v1/ai/conversations")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ title: "New Academic Chat" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.title).toBe("New Academic Chat");
    student1ConversationId = res.body.data.id;
  });

  it("3. Student lists conversation threads ordered by recent activity", async () => {
    const res = await request(app)
      .get("/api/v1/ai/conversations")
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((c: any) => c.id === student1ConversationId)).toBe(true);
  });

  it("4. Student gets conversation details with empty message roster initially", async () => {
    const res = await request(app)
      .get(`/api/v1/ai/conversations/${student1ConversationId}`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(student1ConversationId);
    expect(res.body.data.messages).toEqual([]);
  });

  it("5. Conversation privacy: Peer student is blocked (404) from accessing another student's conversation", async () => {
    const res = await request(app)
      .get(`/api/v1/ai/conversations/${student1ConversationId}`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(404);
  });

  // ==========================================
  // 3. SPECIALIZED ACADEMIC MODES & RESPONSE GENERATION
  // ==========================================

  it("6. Student sends general academic message: receives formatted response, updates title and quota", async () => {
    const res = await request(app)
      .post(`/api/v1/ai/conversations/${student1ConversationId}/messages`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ prompt: "What are the fundamental principles of data structures?" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message.role).toBe("assistant");
    expect(res.body.data.message.content).toContain("Campus Academic Assistant");
    expect(res.body.data.tokensUsed).toBeGreaterThan(0);
    expect(res.body.data.dailyRemaining).toBeLessThan(50000);

    // Verify conversation title updated from initial default
    const convoRes = await request(app)
      .get(`/api/v1/ai/conversations/${student1ConversationId}`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(convoRes.body.data.title).toContain("What are the fundamental principles");
    expect(convoRes.body.data.messages.length).toBe(2); // user + assistant
  });

  it("7. Code mode: returns programming code explanation with syntax formatting", async () => {
    const res = await request(app)
      .post(`/api/v1/ai/conversations/${student1ConversationId}/messages`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        prompt: "Write a function to deduplicate an array in TypeScript",
        mode: "code",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.message.content).toContain("Programming & Code Explanation");
    expect(res.body.data.message.content).toContain("```typescript");
    expect(res.body.data.message.content).toContain("Time Complexity");
  });

  it("8. Math mode: returns mathematical derivation and formula notation", async () => {
    const res = await request(app)
      .post(`/api/v1/ai/conversations/${student1ConversationId}/messages`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        prompt: "Derive Karush-Kuhn-Tucker conditions for constrained optimization",
        mode: "math",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.message.content).toContain("Mathematical Derivation");
    expect(res.body.data.message.content).toContain("KKT");
  });

  it("9. Summarization mode: returns structured executive summary of key takeaways", async () => {
    const res = await request(app)
      .post(`/api/v1/ai/conversations/${student1ConversationId}/messages`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        prompt: "Summarize operating system process virtualization",
        mode: "summarize",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.message.content).toContain("Lecture Notes Executive Summary");
    expect(res.body.data.message.content).toContain("Core Takeaways");
  });

  it("10. Study plan mode: returns structured revision schedule table", async () => {
    const res = await request(app)
      .post(`/api/v1/ai/conversations/${student1ConversationId}/messages`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        prompt: "Create a 6-day study plan for finals",
        mode: "study_plan",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.message.content).toContain("Study Plan");
    expect(res.body.data.message.content).toContain("Mock Examination");
  });

  // ==========================================
  // 4. RAG DOCUMENT CHUNKING & GROUNDED Q&A
  // ==========================================

  it("11. RAG Indexing: Admin indexes approved learning material into DocumentChunks", async () => {
    const customContent = "Shannon's source coding theorem states that the limits of data compression are governed by entropy H(X). Channel capacity C defines the maximum rate of reliable transmission across noisy channels.";

    const res = await request(app)
      .post(`/api/v1/ai/index/${materialId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: customContent });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.indexedChunks).toBeGreaterThanOrEqual(1);

    const chunks = await prisma.documentChunk.findMany({ where: { materialId } });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("12. Grounded Q&A: AI answers query using indexed document and cites verified sources", async () => {
    const res = await request(app)
      .post(`/api/v1/ai/conversations/${student1ConversationId}/messages`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        prompt: "Explain channel capacity and entropy limits according to lecture notes",
        courseOfferingId: offeringId,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.message.content).toContain("Grounded Academic Response");
    expect(res.body.data.message.content).toContain("Entropy, Noisy Channel Coding");
    expect(res.body.data.message.sources).toBeDefined();
    expect(res.body.data.message.sources.length).toBeGreaterThan(0);
  });

  it("13. Direct Ask endpoint: answers quick query and decrements quota without thread creation", async () => {
    const res = await request(app)
      .post("/api/v1/ai/ask")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ prompt: "What is the Big O complexity of binary search?" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.answer).toBeDefined();
    expect(res.body.data.tokensUsed).toBeGreaterThan(0);
  });

  // ==========================================
  // 5. QUOTA EXHAUSTION & AUTOMATIC RESET
  // ==========================================

  it("14. Quota exhaustion defense: Request is rejected (429) when daily quota is exceeded", async () => {
    // Manually set daily tokens used to limit
    await prisma.aIUserQuota.update({
      where: { userId: student1User.id },
      data: { dailyTokensUsed: 50000 },
    });

    const res = await request(app)
      .post(`/api/v1/ai/conversations/${student1ConversationId}/messages`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ prompt: "Will this query succeed?" });

    expect(res.status).toBe(429);
    expect(res.body.error).toContain("QUOTA_EXCEEDED");
  });

  it("15. Automatic 24-hour reset: Quota resets automatically when 24h have passed", async () => {
    // Set lastResetDate to 25 hours ago
    const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.aIUserQuota.update({
      where: { userId: student1User.id },
      data: { lastResetDate: pastDate },
    });

    const res = await request(app)
      .get("/api/v1/ai/quota")
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.dailyTokensUsed).toBe(0);
    expect(res.body.data.dailyRemaining).toBe(50000);
  });

  // ==========================================
  // 6. ADMIN ANALYTICS & QUOTA CONTROL
  // ==========================================

  it("16. Non-admin student is blocked (403) from accessing institutional AI analytics", async () => {
    const res = await request(app)
      .get("/api/v1/ai/admin/analytics")
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(403);
  });

  it("17. Admin accesses institutional AI analytics with total tokens and top consumers", async () => {
    const res = await request(app)
      .get("/api/v1/ai/admin/analytics")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalRequests).toBeGreaterThan(0);
    expect(res.body.data.totalTokens).toBeGreaterThan(0);
    expect(res.body.data.topUsers.length).toBeGreaterThan(0);
  });

  it("18. Admin updates student token quota limit", async () => {
    const res = await request(app)
      .patch(`/api/v1/ai/admin/quotas/${student1User.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ dailyLimit: 75000, monthlyLimit: 2000000 });

    expect(res.status).toBe(200);
    expect(res.body.data.dailyTokenLimit).toBe(75000);
    expect(res.body.data.monthlyTokenLimit).toBe(2000000);
  });

  // ==========================================
  // 7. CONVERSATION DELETION & CLEANUP
  // ==========================================

  it("19. Student deletes conversation thread: cascading deletion of messages", async () => {
    const delRes = await request(app)
      .delete(`/api/v1/ai/conversations/${student1ConversationId}`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.data.success).toBe(true);

    const getRes = await request(app)
      .get(`/api/v1/ai/conversations/${student1ConversationId}`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(getRes.status).toBe(404);
  });

  // ==========================================
  // 8. TELEGRAM BOT AI INTEGRATION
  // ==========================================

  it("20. Telegram /ai command answers student query with grounded response and quota metrics", async () => {
    const mockBot: any = {
      sendMessage: jest.fn().mockResolvedValue(true),
      sendChatAction: jest.fn().mockResolvedValue(true),
    };

    await handleAICommand(mockBot, student1User.telegramChatId, "Explain dynamic programming memoization");

    expect(mockBot.sendMessage).toHaveBeenCalled();
    const [chatId, text] = mockBot.sendMessage.mock.calls[0];
    expect(chatId).toBe(student1User.telegramChatId.toString());
    expect(text).toContain("Tokens:");
    expect(text).toContain("Daily Quota Remaining:");
  });

  it("21. Telegram /ai with empty prompt returns help text and examples", async () => {
    const mockBot: any = {
      sendMessage: jest.fn().mockResolvedValue(true),
      sendChatAction: jest.fn().mockResolvedValue(true),
    };

    await handleAICommand(mockBot, student1User.telegramChatId, "");

    expect(mockBot.sendMessage).toHaveBeenCalled();
    const [, text] = mockBot.sendMessage.mock.calls[0];
    expect(text).toContain("AI Academic Assistant");
    expect(text).toContain("Examples:");
  });
});
