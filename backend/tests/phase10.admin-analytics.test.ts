import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { generateAccessToken } from "../src/utils/jwt";
import { createRateLimiter } from "../src/middleware/rate-limit.middleware";
import express from "express";

const app = createApp();

describe("Phase 10 — Administration, Analytics, Security & Deployment", () => {
  const ts = Date.now();

  let adminUser: any;
  let adminToken: string;

  let teacherUser: any;
  let teacherToken: string;

  let studentUser: any;
  let studentToken: string;

  async function cleanPhase10Data() {
    try {
      await prisma.auditLog.deleteMany({
        where: { action: { startsWith: `TEST_P10_` } },
      });
      await prisma.user.deleteMany({
        where: { email: { contains: "_p10_" } },
      });
    } catch {
      // Ignore
    }
  }

  beforeAll(async () => {
    await cleanPhase10Data();

    // 1. Create Admin
    adminUser = await prisma.user.create({
      data: {
        fullName: "Dr. Phase 10 Admin",
        email: `admin_p10_${ts}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "ADMIN" } },
      },
    });
    const adminSession = await prisma.session.create({ data: { userId: adminUser.id } });
    adminToken = generateAccessToken({ userId: adminUser.id, sessionId: adminSession.id });

    // 2. Create Instructor
    teacherUser = await prisma.user.create({
      data: {
        fullName: "Prof. Ten Instructor",
        email: `instructor_p10_${ts}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const teacherSession = await prisma.session.create({ data: { userId: teacherUser.id } });
    teacherToken = generateAccessToken({ userId: teacherUser.id, sessionId: teacherSession.id });

    // 3. Create Student
    studentUser = await prisma.user.create({
      data: {
        campusId: `P10/${ts.toString().slice(-4)}`,
        fullName: "Student Ten",
        email: `student_p10_${ts}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const studentSession = await prisma.session.create({ data: { userId: studentUser.id } });
    studentToken = generateAccessToken({ userId: studentUser.id, sessionId: studentSession.id });
  });

  afterAll(async () => {
    await cleanPhase10Data();
  });

  test("1. Admin Analytics: Returns full institutional metrics across users, academics, and operations", async () => {
    const res = await request(app)
      .get("/api/v1/admin/analytics")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.users).toBeDefined();
    expect(data.users.total).toBeGreaterThanOrEqual(1);

    expect(data.academic).toBeDefined();
    expect(data.assignments).toBeDefined();
    expect(data.resources).toBeDefined();
    expect(data.assessments).toBeDefined();
    expect(data.community).toBeDefined();
    expect(data.ai).toBeDefined();
    expect(data.generatedAt).toBeDefined();
  });

  test("2. Security: Non-admin student is blocked from accessing admin analytics (403 Forbidden)", async () => {
    const res = await request(app)
      .get("/api/v1/admin/analytics")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("3. Security: Non-admin teacher is blocked from accessing admin analytics (403 Forbidden)", async () => {
    const res = await request(app)
      .get("/api/v1/admin/analytics")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("4. Security: Unauthenticated request is rejected (401 Unauthorized)", async () => {
    const res = await request(app).get("/api/v1/admin/analytics");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("5. System Health: Returns database latency, telegram status, storage checks, and runtime telemetry", async () => {
    const res = await request(app)
      .get("/api/v1/admin/system/health")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const h = res.body.data;
    expect(h.status).toBe("healthy");
    expect(h.database).toBeDefined();
    expect(h.database.status).toBe("healthy");
    expect(typeof h.database.latencyMs).toBe("number");
    expect(h.storage).toBeDefined();
    expect(h.storage.healthy).toBe(true);
    expect(h.runtime).toBeDefined();
    expect(h.runtime.memoryUsageMb).toBeDefined();
  });

  test("6. Audit Logging: Admin records administrative action and retrieves audit trail", async () => {
    // Record audit event
    const createRes = await request(app)
      .post("/api/v1/admin/audit-logs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: `TEST_P10_PROMOTION`,
        entity: "User",
        entityId: studentUser.id,
        targetUserId: studentUser.id,
        details: "Promoted student to cohort representative",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.action).toBe(`TEST_P10_PROMOTION`);

    // Retrieve audit logs
    const listRes = await request(app)
      .get("/api/v1/admin/audit-logs?action=TEST_P10_PROMOTION")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

    const log = listRes.body.data[0];
    expect(log.action).toBe(`TEST_P10_PROMOTION`);
    expect(log.actor.fullName).toBe("Dr. Phase 10 Admin");
    expect(log.target.fullName).toBe("Student Ten");
  });

  test("7. Audit Logging: Supports pagination parameters", async () => {
    const res = await request(app)
      .get("/api/v1/admin/audit-logs?page=1&limit=5")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(5);
  });

  test("8. Rate Limiting Middleware: Enforces throttling with 429 when threshold exceeded", async () => {
    const testApp = express();
    const limiter = createRateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 2,
      skipInTest: false,
    });
    testApp.use(limiter);
    testApp.get("/test-limit", (_req, res) => res.json({ ok: true }));

    // Request 1: Allowed
    const res1 = await request(testApp).get("/test-limit");
    expect(res1.status).toBe(200);
    expect(res1.headers["x-ratelimit-remaining"]).toBe("1");

    // Request 2: Allowed
    const res2 = await request(testApp).get("/test-limit");
    expect(res2.status).toBe(200);
    expect(res2.headers["x-ratelimit-remaining"]).toBe("0");

    // Request 3: Blocked (429 Rate Limit Exceeded)
    const res3 = await request(testApp).get("/test-limit");
    expect(res3.status).toBe(429);
    expect(res3.body.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(res3.headers["retry-after"]).toBeDefined();
  });
});
