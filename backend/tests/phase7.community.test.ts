import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { generateAccessToken } from "../src/utils/jwt";
import { handleBlogCommand } from "../src/modules/telegram/handlers/blog.handler";

const app = createApp();

describe("Phase 7 — Community & Student Blog System", () => {
  let adminToken: string;
  let adminUser: any;
  let student1Token: string;
  let student1User: any;
  let student2Token: string;
  let student2User: any;
  let outsiderToken: string;
  let outsiderUser: any;

  let studentPostId: string;
  let studentPostSlug: string;
  let adminPostId: string;
  let studentCommentId: string;
  let reportId: string;

  beforeAll(async () => {
    const timestamp = Date.now();

    // Clean any prior p7 test users
    const priorP7Users = await prisma.user.findMany({
      where: { email: { contains: "_p7_" } },
      select: { id: true },
    });
    if (priorP7Users.length > 0) {
      const pIds = priorP7Users.map((u) => u.id);
      await prisma.blogReport.deleteMany({ where: { reporterId: { in: pIds } } });
      await prisma.blogComment.deleteMany({ where: { userId: { in: pIds } } });
      await prisma.blogLike.deleteMany({ where: { userId: { in: pIds } } });
      await prisma.bookmark.deleteMany({ where: { userId: { in: pIds } } });
      await prisma.blogPost.deleteMany({ where: { authorId: { in: pIds } } });
      await prisma.notification.deleteMany({ where: { userId: { in: pIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: pIds } } });
      await prisma.userGlobalRole.deleteMany({ where: { userId: { in: pIds } } });
      await prisma.user.deleteMany({ where: { id: { in: pIds } } });
    }

    // 1. Admin User
    adminUser = await prisma.user.create({
      data: {
        fullName: "Dr. Ada Lovelace",
        email: `ada_p7_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "ADMIN" } },
      },
    });
    const adminSession = await prisma.session.create({ data: { userId: adminUser.id } });
    adminToken = generateAccessToken({ userId: adminUser.id, sessionId: adminSession.id });

    // 2. Student 1 (Author)
    student1User = await prisma.user.create({
      data: {
        fullName: "Alan Turing",
        email: `alan_p7_${timestamp}@university.edu`,
        campusId: `RU7001/${timestamp.toString().slice(-4)}`,
        isActive: true,
        telegramChatId: BigInt(timestamp + 1001),
        globalRoles: { create: { role: "USER" } },
      },
    });
    const student1Session = await prisma.session.create({ data: { userId: student1User.id } });
    student1Token = generateAccessToken({ userId: student1User.id, sessionId: student1Session.id });

    // 3. Student 2 (Peer / Commenter)
    student2User = await prisma.user.create({
      data: {
        fullName: "Grace Hopper",
        email: `grace_p7_${timestamp}@university.edu`,
        campusId: `RU7002/${timestamp.toString().slice(-4)}`,
        isActive: true,
        telegramChatId: BigInt(timestamp + 1002),
        globalRoles: { create: { role: "USER" } },
      },
    });
    const student2Session = await prisma.session.create({ data: { userId: student2User.id } });
    student2Token = generateAccessToken({ userId: student2User.id, sessionId: student2Session.id });

    // 4. Outsider
    outsiderUser = await prisma.user.create({
      data: {
        fullName: "Outsider User",
        email: `outsider_p7_${timestamp}@university.edu`,
        campusId: `RU7003/${timestamp.toString().slice(-4)}`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const outsiderSession = await prisma.session.create({ data: { userId: outsiderUser.id } });
    outsiderToken = generateAccessToken({ userId: outsiderUser.id, sessionId: outsiderSession.id });
  });

  afterAll(async () => {
    // Clean up Phase 7 test artifacts
    if (student1User && student2User && adminUser && outsiderUser) {
      const userIds = [student1User.id, student2User.id, adminUser.id, outsiderUser.id];
      await prisma.blogReport.deleteMany({ where: { reporterId: { in: userIds } } });
      await prisma.blogComment.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.blogLike.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.bookmark.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.blogPost.deleteMany({ where: { authorId: { in: userIds } } });
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userGlobalRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  // ==========================================
  // 1. ARTICLE CREATION & VALIDATION
  // ==========================================

  it("1. Student creates a blog post: defaults to PENDING status and generates unique SEO slug", async () => {
    const res = await request(app)
      .post("/api/v1/blog/posts")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        title: "Introduction to Lambda Calculus in TypeScript",
        content: "Lambda calculus serves as the formal foundation for functional programming paradigms...",
        category: "Programming",
        tags: "functional-programming, typescript, calculus",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.slug).toContain("introduction-to-lambda-calculus-in-typescript");
    expect(res.body.data.status).toBe("PENDING");
    expect(res.body.data.authorId).toBe(student1User.id);

    studentPostId = res.body.data.id;
    studentPostSlug = res.body.data.slug;
  });

  it("2. Slug generation handles duplicate titles by appending unique counter suffix", async () => {
    const res = await request(app)
      .post("/api/v1/blog/posts")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        title: "Introduction to Lambda Calculus in TypeScript",
        content: "Second edition of lambda calculus exploration with advanced church encodings...",
        category: "Programming",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe(`${studentPostSlug}-1`);
  });

  it("3. Validation rejects article with short title (<3 chars) or short content (<10 chars)", async () => {
    const badTitleRes = await request(app)
      .post("/api/v1/blog/posts")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        title: "Hi",
        content: "This content is adequately long enough.",
        category: "Technology",
      });

    expect(badTitleRes.status).toBe(400);
    expect(badTitleRes.body.error).toContain("INVALID_INPUT");

    const badContentRes = await request(app)
      .post("/api/v1/blog/posts")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        title: "Valid Title Long Enough",
        content: "Short",
        category: "Technology",
      });

    expect(badContentRes.status).toBe(400);
    expect(badContentRes.body.error).toContain("INVALID_INPUT");
  });

  it("4. Admin creates a blog post: automatically approved without pending moderation", async () => {
    const res = await request(app)
      .post("/api/v1/blog/posts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Announcing Annual Hackathon 2026",
        content: "Join us for the premier campus-wide software engineering and AI competition...",
        category: "Project Ideas",
        tags: "hackathon, innovation, campus",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("APPROVED");
    expect(res.body.data.moderatedById).toBe(adminUser.id);
    adminPostId = res.body.data.id;
  });

  // ==========================================
  // 2. DISCOVERY & VISIBILITY PERMISSIONS
  // ==========================================

  it("5. Student posts remain invisible in public feed while status is PENDING", async () => {
    const res = await request(app)
      .get("/api/v1/blog/posts")
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(200);
    const postIds = res.body.data.map((p: any) => p.id);
    expect(postIds).not.toContain(studentPostId);
    expect(postIds).toContain(adminPostId);
  });

  it("6. Student author can view their own pending post via myPosts=true or direct slug", async () => {
    const listRes = await request(app)
      .get("/api/v1/blog/posts?myPosts=true")
      .set("Authorization", `Bearer ${student1Token}`);

    expect(listRes.status).toBe(200);
    const myPostIds = listRes.body.data.map((p: any) => p.id);
    expect(myPostIds).toContain(studentPostId);

    const directRes = await request(app)
      .get(`/api/v1/blog/posts/${studentPostSlug}`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(directRes.status).toBe(200);
    expect(directRes.body.data.id).toBe(studentPostId);
  });

  it("7. Peer student is blocked (403) from accessing another student's pending post directly", async () => {
    const res = await request(app)
      .get(`/api/v1/blog/posts/${studentPostSlug}`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("FORBIDDEN");
  });

  // ==========================================
  // 3. CONTENT MODERATION & SAFETY
  // ==========================================

  it("8. Self-approval defense: Admin author cannot self-approve their own submission", async () => {
    // Admin creates pending post by manually inserting
    const adminSelfPending = await prisma.blogPost.create({
      data: {
        title: "Admin Research Paper Notes",
        slug: `admin-notes-${Date.now()}`,
        content: "Draft paper review on quantum algorithms...",
        category: "Academic Discussion",
        authorId: adminUser.id,
        status: "PENDING",
      },
    });

    const res = await request(app)
      .patch(`/api/v1/blog/admin/posts/${adminSelfPending.id}/moderate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "APPROVE", note: "Self approved" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Authors cannot self-approve");

    await prisma.blogPost.delete({ where: { id: adminSelfPending.id } });
  });

  it("9. Admin approves student article: status becomes APPROVED and notifies author", async () => {
    const res = await request(app)
      .patch(`/api/v1/blog/admin/posts/${studentPostId}/moderate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "APPROVE",
        note: "Excellent technical explanation of lambda calculus. Approved for public feed.",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("APPROVED");
    expect(res.body.data.moderatedById).toBe(adminUser.id);
    expect(res.body.data.moderationNote).toContain("Excellent technical explanation");

    // Verify in-app notification created for author
    const notif = await prisma.notification.findFirst({
      where: { userId: student1User.id, title: { contains: "Approved" } },
    });
    expect(notif).toBeDefined();
  });

  it("10. Now approved article is publicly visible in general blog feed", async () => {
    const res = await request(app)
      .get("/api/v1/blog/posts")
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(200);
    const postIds = res.body.data.map((p: any) => p.id);
    expect(postIds).toContain(studentPostId);
  });

  // ==========================================
  // 4. SEARCH, FILTERING & VIEW TRACKING
  // ==========================================

  it("11. Category filtering accurately returns matching articles", async () => {
    const progRes = await request(app)
      .get("/api/v1/blog/posts?category=Programming")
      .set("Authorization", `Bearer ${student2Token}`);

    expect(progRes.status).toBe(200);
    expect(progRes.body.data.every((p: any) => p.category === "Programming")).toBe(true);

    const careerRes = await request(app)
      .get("/api/v1/blog/posts?category=Career Development")
      .set("Authorization", `Bearer ${student2Token}`);

    expect(careerRes.status).toBe(200);
    expect(careerRes.body.data.some((p: any) => p.id === studentPostId)).toBe(false);
  });

  it("12. Search query matches across title, content, or tags", async () => {
    const res = await request(app)
      .get("/api/v1/blog/posts?search=calculus")
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(200);
    const found = res.body.data.some((p: any) => p.id === studentPostId);
    expect(found).toBe(true);
  });

  it("13. Reading article increments views counter atomically", async () => {
    const beforeRes = await request(app)
      .get(`/api/v1/blog/posts/${studentPostSlug}`)
      .set("Authorization", `Bearer ${student2Token}`);

    const initialViews = beforeRes.body.data.views;

    const afterRes = await request(app)
      .get(`/api/v1/blog/posts/${studentPostSlug}`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(afterRes.body.data.views).toBe(initialViews + 1);
  });

  // ==========================================
  // 5. SOCIAL INTERACTIONS (LIKES, COMMENTS, BOOKMARKS)
  // ==========================================

  it("14. Toggle Like: First call likes (count=1), second call unlikes (count=0)", async () => {
    // Like
    const likeRes = await request(app)
      .post(`/api/v1/blog/posts/${studentPostId}/like`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(likeRes.status).toBe(200);
    expect(likeRes.body.data.liked).toBe(true);
    expect(likeRes.body.data.likesCount).toBe(1);

    // Unlike
    const unlikeRes = await request(app)
      .post(`/api/v1/blog/posts/${studentPostId}/like`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(unlikeRes.status).toBe(200);
    expect(unlikeRes.body.data.liked).toBe(false);
    expect(unlikeRes.body.data.likesCount).toBe(0);

    // Re-like for author stats
    await request(app)
      .post(`/api/v1/blog/posts/${studentPostId}/like`)
      .set("Authorization", `Bearer ${student2Token}`);
  });

  it("15. Student adds comment: persists and sends notification to article author", async () => {
    const res = await request(app)
      .post(`/api/v1/blog/posts/${studentPostId}/comments`)
      .set("Authorization", `Bearer ${student2Token}`)
      .send({ content: "Fascinating explanation! Can you write a follow-up on beta reduction?" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.content).toContain("beta reduction");
    studentCommentId = res.body.data.id;

    // Check author notification
    const commentNotif = await prisma.notification.findFirst({
      where: { userId: student1User.id, title: { contains: "New Comment" } },
    });
    expect(commentNotif).toBeDefined();
  });

  it("16. Delete comment: Non-author peer cannot delete comment (403)", async () => {
    const res = await request(app)
      .delete(`/api/v1/blog/comments/${studentCommentId}`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("FORBIDDEN");
  });

  it("17. Delete comment: Comment author can delete their own comment", async () => {
    const res = await request(app)
      .delete(`/api/v1/blog/comments/${studentCommentId}`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    const deletedComment = await prisma.blogComment.findUnique({ where: { id: studentCommentId } });
    expect(deletedComment?.isDeleted).toBe(true);
  });

  it("18. Toggle Bookmark: Student saves article and retrieves it from /bookmarks", async () => {
    const bmRes = await request(app)
      .post(`/api/v1/blog/posts/${studentPostId}/bookmark`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(bmRes.status).toBe(200);
    expect(bmRes.body.data.bookmarked).toBe(true);

    const listBmRes = await request(app)
      .get("/api/v1/blog/bookmarks")
      .set("Authorization", `Bearer ${student2Token}`);

    expect(listBmRes.status).toBe(200);
    const bookmarkedIds = listBmRes.body.data.map((b: any) => b.post.id);
    expect(bookmarkedIds).toContain(studentPostId);
  });

  // ==========================================
  // 6. AUTHOR PROFILES & AGGREGATE STATS
  // ==========================================

  it("19. Author profile aggregates total articles, views, and likes accurately", async () => {
    const res = await request(app)
      .get(`/api/v1/blog/authors/${student1User.id}`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.author.fullName).toBe("Alan Turing");
    expect(res.body.data.stats.totalPosts).toBeGreaterThanOrEqual(1);
    expect(res.body.data.stats.totalViews).toBeGreaterThanOrEqual(1);
    expect(res.body.data.stats.totalLikes).toBeGreaterThanOrEqual(1);
    expect(res.body.data.posts.length).toBeGreaterThanOrEqual(1);
  });

  // ==========================================
  // 7. CONTENT REPORTING & ADMIN RESOLUTION
  // ==========================================

  it("20. Student reports inappropriate post: creates PENDING report", async () => {
    const res = await request(app)
      .post(`/api/v1/blog/posts/${studentPostId}/report`)
      .set("Authorization", `Bearer ${student2Token}`)
      .send({
        reason: "Academic Misconduct / Plagiarism",
        details: "Please verify citations against standard literature.",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe("PENDING");
    reportId = res.body.data.id;
  });

  it("21. Duplicate report defense: Submitting second report for same post is blocked (409)", async () => {
    const res = await request(app)
      .post(`/api/v1/blog/posts/${studentPostId}/report`)
      .set("Authorization", `Bearer ${student2Token}`)
      .send({ reason: "Duplicate submission attempt" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("ALREADY_REPORTED");
  });

  it("22. Non-admin student is blocked from accessing admin reports queue (403)", async () => {
    const res = await request(app)
      .get("/api/v1/blog/admin/reports")
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(403);
  });

  it("23. Admin lists reports and resolves a report", async () => {
    const listRes = await request(app)
      .get("/api/v1/blog/admin/reports?status=PENDING")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((r: any) => r.id === reportId)).toBe(true);

    const resolveRes = await request(app)
      .patch(`/api/v1/blog/admin/reports/${reportId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "RESOLVED" });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.status).toBe("RESOLVED");
  });

  // ==========================================
  // 8. POST UPDATE & SOFT DELETION
  // ==========================================

  it("24. Non-author peer cannot update article (403)", async () => {
    const res = await request(app)
      .patch(`/api/v1/blog/posts/${studentPostId}`)
      .set("Authorization", `Bearer ${student2Token}`)
      .send({ title: "Unauthorized title edit" });

    expect(res.status).toBe(403);
  });

  it("25. Author successfully updates their article", async () => {
    const res = await request(app)
      .patch(`/api/v1/blog/posts/${studentPostId}`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ title: "Introduction to Lambda Calculus & Combinatory Logic" });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Introduction to Lambda Calculus & Combinatory Logic");
  });

  it("26. Author soft-deletes post: removed from public listing", async () => {
    const delRes = await request(app)
      .delete(`/api/v1/blog/posts/${studentPostId}`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.data.success).toBe(true);

    const listRes = await request(app)
      .get("/api/v1/blog/posts")
      .set("Authorization", `Bearer ${student2Token}`);

    expect(listRes.body.data.some((p: any) => p.id === studentPostId)).toBe(false);
  });

  // ==========================================
  // 9. COVER IMAGE UPLOADER & TELEGRAM INTEGRATION
  // ==========================================

  it("27. Cover image upload: Valid image succeeds with persistent fileUrl", async () => {
    const dummyImage = Buffer.from("fake-png-image-binary-data");

    const res = await request(app)
      .post("/api/v1/blog/upload-cover")
      .set("Authorization", `Bearer ${student1Token}`)
      .attach("image", dummyImage, { filename: "cover.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.data.fileUrl).toContain("/storage/uploads/");
  });

  it("28. Cover image upload: Invalid MIME type (e.g. application/pdf) is rejected (400)", async () => {
    const dummyPdf = Buffer.from("%PDF-1.4 mock pdf data");

    const res = await request(app)
      .post("/api/v1/blog/upload-cover")
      .set("Authorization", `Bearer ${student1Token}`)
      .attach("image", dummyPdf, { filename: "doc.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid image format");
  });

  it("29. Telegram /blog command formats and delivers approved articles cleanly", async () => {
    const mockBot: any = {
      sendMessage: jest.fn().mockResolvedValue(true),
    };

    await handleBlogCommand(mockBot, 7001001, "Hackathon");

    expect(mockBot.sendMessage).toHaveBeenCalled();
    const [chatId, text, options] = mockBot.sendMessage.mock.calls[0];
    expect(chatId).toBe("7001001");
    expect(text).toContain("Student Academic Blog");
    expect(text).toContain("Announcing Annual Hackathon 2026");
    expect(options.reply_markup.inline_keyboard).toBeDefined();
  });
});
