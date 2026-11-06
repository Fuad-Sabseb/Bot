import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { generateAccessToken } from "../src/utils/jwt";

const app = createApp();

describe("Scoped Role-Based Access Control (RBAC)", () => {
  let adminToken: string;
  let studentToken: string;
  let classRepToken: string;
  let classAId: string;
  let classBId: string;

  beforeAll(async () => {
    // 1. Create Academic Year
    const year = await prisma.academicYear.upsert({
      where: { name: "2026/2027" },
      update: {},
      create: {
        name: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
      },
    });

    // 2. Create Two Distinct Classes
    const classA = await prisma.class.upsert({
      where: { code: "CLASS-A-TEST" },
      update: {},
      create: {
        name: "Computer Science Class A",
        code: "CLASS-A-TEST",
        department: "CS",
        academicYearId: year.id,
      },
    });
    classAId = classA.id;

    const classB = await prisma.class.upsert({
      where: { code: "CLASS-B-TEST" },
      update: {},
      create: {
        name: "Computer Science Class B",
        code: "CLASS-B-TEST",
        department: "CS",
        academicYearId: year.id,
      },
    });
    classBId = classB.id;

    // 3. Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        fullName: "System Admin",
        email: `admin_${Date.now()}@university.edu`,
        globalRoles: { create: { role: "ADMIN" } },
      },
    });

    const adminSession = await prisma.session.create({ data: { userId: adminUser.id } });
    adminToken = generateAccessToken({ userId: adminUser.id, sessionId: adminSession.id });

    // 4. Create Normal Student User
    const studentUser = await prisma.user.create({
      data: {
        fullName: "Regular Student",
        email: `student_${Date.now()}@university.edu`,
        globalRoles: { create: { role: "USER" } },
      },
    });

    const studentSession = await prisma.session.create({ data: { userId: studentUser.id } });
    studentToken = generateAccessToken({ userId: studentUser.id, sessionId: studentSession.id });

    // 5. Create Class Representative (Scoper: Class A only)
    const classRepUser = await prisma.user.create({
      data: {
        fullName: "Class Representative A",
        email: `classrep_${Date.now()}@university.edu`,
        globalRoles: { create: { role: "USER" } },
        classRoles: {
          create: {
            classId: classAId,
            role: "CLASS_REP",
          },
        },
      },
    });

    const repSession = await prisma.session.create({ data: { userId: classRepUser.id } });
    classRepToken = generateAccessToken({ userId: classRepUser.id, sessionId: repSession.id });
  });

  test("1. Global Admin can access protected admin overview", async () => {
    const res = await request(app)
      .get("/api/v1/admin/overview")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("2. Regular Student is denied access to admin overview (403 Forbidden)", async () => {
    const res = await request(app)
      .get("/api/v1/admin/overview")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  test("3. Unauthenticated request is rejected (401 Unauthorized)", async () => {
    const res = await request(app).get("/api/v1/admin/overview");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
