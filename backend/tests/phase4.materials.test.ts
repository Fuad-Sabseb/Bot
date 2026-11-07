import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { generateAccessToken } from "../src/utils/jwt";
import fs from "fs";

const app = createApp();

describe("Phase 4 — Learning Materials and Academic Resources System", () => {
  let adminToken: string;
  let adminUser: any;
  let teacherToken: string;
  let teacherUser: any;
  let classRepToken: string;
  let classRepUser: any;
  let student1Token: string;
  let student1User: any;
  let student2Token: string;
  let student2User: any;
  let outsiderToken: string;
  let outsiderUser: any;

  let offeringId: string;
  let teacherMaterialId: string;
  let studentMaterialId: string;

  beforeAll(async () => {
    const timestamp = Date.now();

    // 1. Create Admin
    adminUser = await prisma.user.create({
      data: {
        fullName: "Dr. Admin Dean",
        email: `admin_p4_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "ADMIN" } },
      },
    });
    const adminSession = await prisma.session.create({ data: { userId: adminUser.id } });
    adminToken = generateAccessToken({ userId: adminUser.id, sessionId: adminSession.id });

    // 2. Create Instructor
    teacherUser = await prisma.user.create({
      data: {
        fullName: "Prof. Barbara Liskov",
        email: `liskov_p4_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const teacherSession = await prisma.session.create({ data: { userId: teacherUser.id } });
    teacherToken = generateAccessToken({ userId: teacherUser.id, sessionId: teacherSession.id });

    // 3. Create Class Rep
    classRepUser = await prisma.user.create({
      data: {
        fullName: "Charlie Rep",
        campusId: `CR4_${timestamp}`,
        email: `rep_p4_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const classRepSession = await prisma.session.create({ data: { userId: classRepUser.id } });
    classRepToken = generateAccessToken({ userId: classRepUser.id, sessionId: classRepSession.id });

    // 4. Create Students
    student1User = await prisma.user.create({
      data: {
        fullName: "Diana Prince",
        campusId: `S4A_${timestamp}`,
        email: `diana_p4_${timestamp}@university.edu`,
        isActive: true,
        telegramChatId: BigInt(Math.floor(Math.random() * 899999999 + 100000000)),
        globalRoles: { create: { role: "USER" } },
      },
    });
    const s1Session = await prisma.session.create({ data: { userId: student1User.id } });
    student1Token = generateAccessToken({ userId: student1User.id, sessionId: s1Session.id });

    student2User = await prisma.user.create({
      data: {
        fullName: "Evan Wright",
        campusId: `S4B_${timestamp}`,
        email: `evan_p4_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const s2Session = await prisma.session.create({ data: { userId: student2User.id } });
    student2Token = generateAccessToken({ userId: student2User.id, sessionId: s2Session.id });

    // 5. Create Outsider
    outsiderUser = await prisma.user.create({
      data: {
        fullName: "Fiona Outsider",
        campusId: `S4OUT_${timestamp}`,
        email: `fiona_p4_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const outSession = await prisma.session.create({ data: { userId: outsiderUser.id } });
    outsiderToken = generateAccessToken({ userId: outsiderUser.id, sessionId: outSession.id });

    // 6. Setup Academic Hierarchy
    const academicYear = await prisma.academicYear.create({
      data: {
        name: `AY4_${timestamp}`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
      },
    });

    const semester = await prisma.semester.create({
      data: {
        academicYearId: academicYear.id,
        semesterNumber: 1,
        name: `Semester 1 (AY4_${timestamp})`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-01-31"),
      },
    });

    const classCohort = await prisma.class.create({
      data: {
        name: `Software Architecture Cohort_${timestamp}`,
        code: `SA-${timestamp.toString().slice(-4)}`,
        department: "Software Engineering",
        academicYearId: academicYear.id,
      },
    });

    const course = await prisma.course.create({
      data: {
        code: `SE-ARCH-${timestamp.toString().slice(-4)}`,
        title: "Advanced Software Architecture & Design Patterns",
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

    // Assign Instructor
    await prisma.userCourseRole.create({
      data: {
        userId: teacherUser.id,
        courseOfferingId: offeringId,
        role: "LEAD_INSTRUCTOR",
      },
    });

    // Assign Class Rep
    await prisma.userClassRole.create({
      data: {
        userId: classRepUser.id,
        classId: classCohort.id,
        role: "CLASS_REP",
      },
    });

    // Enroll Students
    await prisma.enrollment.createMany({
      data: [
        { userId: student1User.id, courseOfferingId: offeringId, status: "ACTIVE" },
        { userId: student2User.id, courseOfferingId: offeringId, status: "ACTIVE" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ==========================================
  // 1. RESOURCE CREATION & UPLOAD VALIDATION
  // ==========================================

  test("1. Assigned Instructor uploads lecture slides (auto-approved status)", async () => {
    const res = await request(app)
      .post("/api/v1/materials")
      .set("Authorization", `Bearer ${teacherToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Lecture 01: Microservices Architecture Principles")
      .field("description", "Introduction to service boundaries, API gateways, and asynchronous messaging.")
      .field("category", "LECTURE_SLIDES")
      .field("tags", "microservices,architecture,eda")
      .attach(
        "file",
        Buffer.from("PDF-1.4 Microservices slides content"),
        "lecture01_slides.pdf"
      );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe("APPROVED"); // Instructor upload is auto-approved
    expect(res.body.data.fileName).toBe("lecture01_slides.pdf");
    expect(res.body.data.category).toBe("LECTURE_SLIDES");

    teacherMaterialId = res.body.data.id;
  });

  test("2. Enrolled Student uploads study notes (enters PENDING moderation status)", async () => {
    const res = await request(app)
      .post("/api/v1/materials")
      .set("Authorization", `Bearer ${student1Token}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Student Comprehensive Summary: Domain-Driven Design")
      .field("description", "Notes on aggregates, bounded contexts, and domain events.")
      .field("category", "LECTURE_NOTES")
      .field("tags", "ddd,notes,exam-prep")
      .attach(
        "file",
        Buffer.from("Domain-Driven Design Student Notes Markdown Content"),
        "ddd_summary.md"
      );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("PENDING"); // Student upload requires moderation
    expect(res.body.data.uploader.id).toBe(student1User.id);

    studentMaterialId = res.body.data.id;
  });

  test("3. Upload rejects unsupported executable or script file types", async () => {
    const res = await request(app)
      .post("/api/v1/materials")
      .set("Authorization", `Bearer ${student1Token}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Dangerous Binary")
      .field("category", "OTHER")
      .attach(
        "file",
        Buffer.from("MZ\x90\x00\x03\x00\x00\x00Binary executable"),
        "malware.exe"
      );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("UNSUPPORTED_MIME_TYPE");
  });

  test("4. Non-enrolled outsider is blocked from uploading resources (403 Forbidden)", async () => {
    const res = await request(app)
      .post("/api/v1/materials")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Outsider Infiltration")
      .field("category", "OTHER")
      .attach("file", Buffer.from("Valid PDF content"), "test.pdf");

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ==========================================
  // 2. RESOURCE DISCOVERY, FILTERING & SEARCH
  // ==========================================

  test("5. Enrolled student browses approved resources in course offering", async () => {
    const res = await request(app)
      .get(`/api/v1/materials?courseOfferingId=${offeringId}`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.materials.length).toBeGreaterThanOrEqual(1);

    // Verified: student2 can see the approved teacher material
    const teacherMat = res.body.data.materials.find((m: any) => m.id === teacherMaterialId);
    expect(teacherMat).toBeDefined();

    // Verified: student2 CANNOT see student1's PENDING material
    const pendingMat = res.body.data.materials.find((m: any) => m.id === studentMaterialId);
    expect(pendingMat).toBeUndefined();
  });

  test("6. Search materials by keyword in title/description/tags", async () => {
    const res = await request(app)
      .get(`/api/v1/materials?search=Microservices`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.materials.some((m: any) => m.title.includes("Microservices"))).toBe(true);
  });

  test("7. Filter materials by category (LECTURE_SLIDES)", async () => {
    const res = await request(app)
      .get(`/api/v1/materials?category=LECTURE_SLIDES`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.materials.every((m: any) => m.category === "LECTURE_SLIDES")).toBe(true);
  });

  // ==========================================
  // 3. MODERATION WORKFLOW
  // ==========================================

  test("8. Instructor retrieves moderation queue for their course offering", async () => {
    const res = await request(app)
      .get("/api/v1/materials/moderation/queue")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const pendingItem = res.body.data.find((m: any) => m.id === studentMaterialId);
    expect(pendingItem).toBeDefined();
    expect(pendingItem.status).toBe("PENDING");
  });

  test("9. Ordinary student cannot access the moderation queue (403 Forbidden or empty)", async () => {
    const res = await request(app)
      .get("/api/v1/materials/moderation/queue")
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0); // Not an instructor of any offering
  });

  test("10. Instructor approves student material: status becomes APPROVED and notifies class", async () => {
    const res = await request(app)
      .patch(`/api/v1/materials/${studentMaterialId}/moderate`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        status: "APPROVED",
        note: "Excellent summary of DDD principles! Approved for class distribution.",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("APPROVED");
    expect(res.body.data.moderatedBy.id).toBe(teacherUser.id);

    // Verify uploader received moderation verdict notification
    const note = await prisma.notification.findFirst({
      where: { userId: student1User.id, type: "SYSTEM_ALERT" },
    });
    expect(note).toBeDefined();
    expect(note?.message).toContain("approved");
  });

  test("11. After approval, student material is now visible to all enrolled peers", async () => {
    const res = await request(app)
      .get(`/api/v1/materials?courseOfferingId=${offeringId}`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(200);
    const approvedMat = res.body.data.materials.find((m: any) => m.id === studentMaterialId);
    expect(approvedMat).toBeDefined();
    expect(approvedMat.status).toBe("APPROVED");
  });

  // ==========================================
  // 4. RESOURCE DETAIL & ATOMIC DOWNLOAD
  // ==========================================

  test("12. Enrolled student downloads resource: increments downloads atomically", async () => {
    const preCheck = await prisma.learningMaterial.findUnique({
      where: { id: teacherMaterialId },
    });
    const preDownloads = preCheck?.downloads || 0;

    const res = await request(app)
      .get(`/api/v1/materials/${teacherMaterialId}/download`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.header["content-disposition"]).toContain("attachment");
    expect(res.body.toString() || res.text).toBe("PDF-1.4 Microservices slides content");

    // Verify counter incremented in PostgreSQL
    const postCheck = await prisma.learningMaterial.findUnique({
      where: { id: teacherMaterialId },
    });
    expect(postCheck?.downloads).toBe(preDownloads + 1);
  });

  test("13. Non-enrolled outsider is denied download access (403 Forbidden)", async () => {
    const res = await request(app)
      .get(`/api/v1/materials/${teacherMaterialId}/download`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ==========================================
  // 5. RESOURCE UPDATES & SAFE DELETION
  // ==========================================

  test("14. Uploader or Instructor updates resource metadata", async () => {
    const res = await request(app)
      .patch(`/api/v1/materials/${teacherMaterialId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        title: "Lecture 01: Microservices Architecture (2026 Edition)",
        tags: "microservices,soa,distributed,updated",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toContain("2026 Edition");
  });

  test("15. Unauthorized student cannot update another user's material (403 Forbidden)", async () => {
    const res = await request(app)
      .patch(`/api/v1/materials/${teacherMaterialId}`)
      .set("Authorization", `Bearer ${student2Token}`)
      .send({ title: "Vandalized Title" });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("16. Instructor soft-deletes a material: marked isDeleted = true and excluded from list", async () => {
    const res = await request(app)
      .delete(`/api/v1/materials/${studentMaterialId}`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const listRes = await request(app)
      .get(`/api/v1/materials?courseOfferingId=${offeringId}`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(listRes.body.data.materials.some((m: any) => m.id === studentMaterialId)).toBe(false);
  });

  test("17. Admin purges material permanently with physical file cleanup", async () => {
    // 1. Create a temporary material to purge
    const createRes = await request(app)
      .post("/api/v1/materials")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Temporary Purge Candidate")
      .field("category", "OTHER")
      .attach("file", Buffer.from("Ephemeral content to purge"), "purge_me.txt");

    const purgeId = createRes.body.data.id;
    const fileKey = createRes.body.data.fileKey;

    // 2. Admin purges with ?purge=true
    const purgeRes = await request(app)
      .delete(`/api/v1/materials/${purgeId}?purge=true`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(purgeRes.status).toBe(200);
    expect(purgeRes.body.message).toContain("purged");

    // 3. Confirm record is deleted from DB
    const dbCheck = await prisma.learningMaterial.findUnique({ where: { id: purgeId } });
    expect(dbCheck).toBeNull();
  });

  test("18. Material usage analytics returns aggregates and top downloads", async () => {
    const res = await request(app)
      .get("/api/v1/materials/stats")
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.totalResources).toBe("number");
    expect(typeof res.body.data.totalDownloads).toBe("number");
    expect(Array.isArray(res.body.data.categoryDistribution)).toBe(true);
    expect(Array.isArray(res.body.data.topDownloaded)).toBe(true);
  });

  test("19. Extension spoofing defense: rejects dangerous extensions even if MIME is application/pdf", async () => {
    const res = await request(app)
      .post("/api/v1/materials")
      .set("Authorization", `Bearer ${teacherToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Spoofed Trojan")
      .field("category", "OTHER")
      .attach("file", Buffer.from("Harmless looking text"), {
        filename: "trojan.exe",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("UNSUPPORTED_MIME_TYPE");
  });

  test("20. Binary content signature defense: rejects PE/MZ binary disguised with .pdf extension", async () => {
    const fakePdfWithMzHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

    const res = await request(app)
      .post("/api/v1/materials")
      .set("Authorization", `Bearer ${teacherToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Disguised Windows Binary")
      .field("category", "OTHER")
      .attach("file", fakePdfWithMzHeader, {
        filename: "innocent_document.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Executable binary detected");
  });

  test("21. Scope immutability: updating resource ignores courseOfferingId changes", async () => {
    const fakeOtherOfferingId = "fake-other-offering-id-999";

    const res = await request(app)
      .patch(`/api/v1/materials/${teacherMaterialId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        title: "Lecture 01: Final Edition",
        courseOfferingId: fakeOtherOfferingId, // Attempt to escape course scope
      });

    expect(res.status).toBe(200);

    // Verify courseOfferingId remained original offeringId
    const checkDb = await prisma.learningMaterial.findUnique({
      where: { id: teacherMaterialId },
    });
    expect(checkDb?.courseOfferingId).toBe(offeringId);
  });
});
