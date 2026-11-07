import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { generateAccessToken } from "../src/utils/jwt";

const app = createApp();

describe("Phase 2 — Academic Structure, User Management, Enrollments & Dashboards", () => {
  let adminToken: string;
  let adminUser: any;
  let studentToken: string;
  let studentUser: any;
  let teacherToken: string;
  let teacherUser: any;
  let classRepToken: string;
  let classRepUser: any;

  let academicYearId: string;
  let semesterId: string;
  let classId: string;
  let courseId: string;
  let offeringId: string;

  beforeAll(async () => {
    // 1. Create Admin
    adminUser = await prisma.user.create({
      data: {
        fullName: "Super Administrator",
        email: `admin_p2_${Date.now()}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "ADMIN" } },
      },
    });
    const adminSession = await prisma.session.create({ data: { userId: adminUser.id } });
    adminToken = generateAccessToken({ userId: adminUser.id, sessionId: adminSession.id });

    // 2. Create Student
    studentUser = await prisma.user.create({
      data: {
        fullName: "Alex Student",
        campusId: `RU9999_${Date.now()}`,
        email: `student_p2_${Date.now()}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const studentSession = await prisma.session.create({ data: { userId: studentUser.id } });
    studentToken = generateAccessToken({ userId: studentUser.id, sessionId: studentSession.id });

    // 3. Create Teacher
    teacherUser = await prisma.user.create({
      data: {
        fullName: "Professor Turing",
        email: `turing_${Date.now()}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const teacherSession = await prisma.session.create({ data: { userId: teacherUser.id } });
    teacherToken = generateAccessToken({ userId: teacherUser.id, sessionId: teacherSession.id });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ==========================================
  // ACADEMIC STRUCTURE
  // ==========================================

  test("1. Admin creates Academic Year", async () => {
    const res = await request(app)
      .post("/api/v1/academic/years")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: `2026/2027_${Date.now()}`,
        startDate: "2026-09-01",
        endDate: "2027-06-30",
        isCurrent: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    academicYearId = res.body.data.id;
  });

  test("2. Admin creates Semester within Academic Year", async () => {
    const res = await request(app)
      .post("/api/v1/academic/semesters")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        academicYearId,
        semesterNumber: 1,
        name: "Fall 2026",
        startDate: "2026-09-01",
        endDate: "2027-01-30",
        isCurrent: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    semesterId = res.body.data.id;
  });

  test("3. Admin creates Class Cohort", async () => {
    const res = await request(app)
      .post("/api/v1/academic/classes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Software Engineering Class 2027",
        code: `SE-2027-${Date.now()}`,
        department: "Computer Science",
        academicYearId,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    classId = res.body.data.id;
  });

  test("4. Admin creates Course Catalog Entry", async () => {
    const res = await request(app)
      .post("/api/v1/academic/courses")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: `CS301-${Date.now()}`,
        title: "Algorithms & Data Structures",
        description: "Core algorithms and complexity analysis",
        credits: 4,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    courseId = res.body.data.id;
  });

  test("5. Admin creates Course Offering (Course + Semester + Class)", async () => {
    const res = await request(app)
      .post("/api/v1/academic/offerings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        courseId,
        semesterId,
        classId,
        syllabus: "Weekly lecture topics and lab assignments.",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    offeringId = res.body.data.id;
  });

  test("6. Non-admin is blocked from creating academic structure (403 Forbidden)", async () => {
    const res = await request(app)
      .post("/api/v1/academic/courses")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        code: "UNAUTHORIZED_101",
        title: "Unauthorized Course",
      });

    expect(res.status).toBe(403);
  });

  // ==========================================
  // INSTRUCTORS & ENROLLMENTS
  // ==========================================

  test("7. Admin assigns Teacher to Course Offering", async () => {
    const res = await request(app)
      .post(`/api/v1/academic/offerings/${offeringId}/instructors`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        instructorId: teacherUser.id,
        role: "LEAD_INSTRUCTOR",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(teacherUser.id);
    expect(res.body.data.role).toBe("LEAD_INSTRUCTOR");
  });

  test("8. Admin assigns Student to Class Cohort and enrolls in Course Offering", async () => {
    // Assign student to class cohort
    const classAssignRes = await request(app)
      .post(`/api/v1/academic/classes/${classId}/students`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ studentId: studentUser.id });

    expect(classAssignRes.status).toBe(200);

    // Enroll student in offering
    const enrollRes = await request(app)
      .post(`/api/v1/academic/offerings/${offeringId}/enroll`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ studentId: studentUser.id });

    expect(enrollRes.status).toBe(201);
    expect(enrollRes.body.data.status).toBe("ACTIVE");
  });

  test("9. Batch enrollment of class cohort into offering", async () => {
    const batchRes = await request(app)
      .post(`/api/v1/academic/offerings/${offeringId}/enroll-batch`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(batchRes.status).toBe(200);
    expect(batchRes.body.enrolledCount).toBeGreaterThanOrEqual(1);
  });

  test("10. Student checks my-courses endpoint", async () => {
    const res = await request(app)
      .get("/api/v1/academic/my-courses")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.enrolled.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.enrolled[0].offeringId).toBe(offeringId);
  });

  test("11. Teacher checks my-courses endpoint", async () => {
    const res = await request(app)
      .get("/api/v1/academic/my-courses")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.instructed.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.instructed[0].role).toBe("LEAD_INSTRUCTOR");
  });

  // ==========================================
  // USER MANAGEMENT & ROLES
  // ==========================================

  test("12. Admin provisions new Teacher account", async () => {
    const res = await request(app)
      .post("/api/v1/users/teachers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        fullName: "Dr. Ada Lovelace",
        email: `lovelace_${Date.now()}@university.edu`,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.teacher.fullName).toBe("Dr. Ada Lovelace");
    expect(res.body.data.provisionalPassword).toBeDefined();
  });

  test("13. Admin promotes student to Class Representative for Class Cohort", async () => {
    const res = await request(app)
      .post(`/api/v1/users/${studentUser.id}/roles/class`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        classId,
        role: "CLASS_REP",
        assign: true,
      });

    expect(res.status).toBe(200);

    // Verify student profile now reflects CLASS_REP role
    const profileRes = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.classRoles.some((r: any) => r.role === "CLASS_REP")).toBe(true);
  });

  test("14. Admin deactivates user account (suspension revokes active sessions)", async () => {
    // Deactivate student
    const deactRes = await request(app)
      .patch(`/api/v1/users/${studentUser.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(deactRes.status).toBe(200);
    expect(deactRes.body.data.isActive).toBe(false);

    // Verify student session is now rejected with 401/403
    const testRes = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${studentToken}`);

    expect([401, 403]).toContain(testRes.status);

    // Reactivate for subsequent tests
    await request(app)
      .patch(`/api/v1/users/${studentUser.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });
  });

  // ==========================================
  // TELEGRAM ACCOUNT LINKING
  // ==========================================

  test("15. Student generates Telegram linking OTP token", async () => {
    // Generate fresh session for student
    const sess = await prisma.session.create({ data: { userId: studentUser.id } });
    const freshStudentToken = generateAccessToken({ userId: studentUser.id, sessionId: sess.id });

    const res = await request(app)
      .post("/api/v1/users/telegram/link-token")
      .set("Authorization", `Bearer ${freshStudentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.otp).toMatch(/^\d{6}$/);

    const otp = res.body.data.otp;
    const mockChatId = Math.floor(100000000 + Math.random() * 800000000);

    // Verify OTP link
    const linkRes = await request(app)
      .post("/api/v1/users/telegram/link")
      .send({
        otp,
        telegramChatId: mockChatId,
        telegramUsername: "alex_student",
      });

    expect(linkRes.status).toBe(200);
    expect(linkRes.body.user.telegramChatId).toBe(mockChatId.toString());

    // Verify DB update
    const userInDb = await prisma.user.findUnique({ where: { id: studentUser.id } });
    expect(userInDb?.telegramChatId).toBe(BigInt(mockChatId));
    expect(userInDb?.isVerified).toBe(true);
  });

  // ==========================================
  // ROLE-BASED DASHBOARD
  // ==========================================

  test("16. Admin Dashboard returns system metrics", async () => {
    const res = await request(app)
      .get("/api/v1/dashboard/overview")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.roleScope).toBe("ADMIN");
    expect(res.body.data.metrics.totalUsers).toBeGreaterThanOrEqual(3);
    expect(res.body.data.academicContext.currentYear).toBeDefined();
  });

  test("17. Teacher Dashboard returns instructed courses", async () => {
    const res = await request(app)
      .get("/api/v1/dashboard/overview")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.roleScope).toBe("TEACHER");
    expect(res.body.data.coursesCount).toBeGreaterThanOrEqual(1);
  });
});
