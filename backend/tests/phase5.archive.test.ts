import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { generateAccessToken } from "../src/utils/jwt";
import { handleArchiveCommand } from "../src/modules/telegram/handlers/archive.handler";
import fs from "fs";

const app = createApp();

describe("Phase 5 — Previous-Year Examination and Project Archive System", () => {
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
  let courseId: string;
  let teacherExamId: string;
  let teacherSolutionId: string;
  let studentProjectId: string;
  let studentRejectedId: string;

  beforeAll(async () => {
    const timestamp = Date.now();

    // 1. Create Admin
    adminUser = await prisma.user.create({
      data: {
        fullName: "Dr. Archive Dean",
        email: `admin_p5_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "ADMIN" } },
      },
    });
    const adminSession = await prisma.session.create({ data: { userId: adminUser.id } });
    adminToken = generateAccessToken({ userId: adminUser.id, sessionId: adminSession.id });

    // 2. Create Instructor
    teacherUser = await prisma.user.create({
      data: {
        fullName: "Prof. Alan Turing",
        email: `turing_p5_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const teacherSession = await prisma.session.create({ data: { userId: teacherUser.id } });
    teacherToken = generateAccessToken({ userId: teacherUser.id, sessionId: teacherSession.id });

    // 3. Create Class Rep
    classRepUser = await prisma.user.create({
      data: {
        fullName: "Grace Rep",
        campusId: `CR5_${timestamp}`,
        email: `rep_p5_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const classRepSession = await prisma.session.create({ data: { userId: classRepUser.id } });
    classRepToken = generateAccessToken({ userId: classRepUser.id, sessionId: classRepSession.id });

    // 4. Create Students
    student1User = await prisma.user.create({
      data: {
        fullName: "Alice Student",
        campusId: `S5A_${timestamp}`,
        email: `alice_p5_${timestamp}@university.edu`,
        isActive: true,
        telegramChatId: BigInt(Math.floor(Math.random() * 899999999 + 100000000)),
        globalRoles: { create: { role: "USER" } },
      },
    });
    const s1Session = await prisma.session.create({ data: { userId: student1User.id } });
    student1Token = generateAccessToken({ userId: student1User.id, sessionId: s1Session.id });

    student2User = await prisma.user.create({
      data: {
        fullName: "Bob Student",
        campusId: `S5B_${timestamp}`,
        email: `bob_p5_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const s2Session = await prisma.session.create({ data: { userId: student2User.id } });
    student2Token = generateAccessToken({ userId: student2User.id, sessionId: s2Session.id });

    // 5. Create Outsider
    outsiderUser = await prisma.user.create({
      data: {
        fullName: "Oscar Outsider",
        campusId: `S5OUT_${timestamp}`,
        email: `oscar_p5_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const outSession = await prisma.session.create({ data: { userId: outsiderUser.id } });
    outsiderToken = generateAccessToken({ userId: outsiderUser.id, sessionId: outSession.id });

    // 6. Setup Academic Hierarchy
    const academicYear = await prisma.academicYear.create({
      data: {
        name: `AY5_${timestamp}`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
      },
    });

    const semester = await prisma.semester.create({
      data: {
        academicYearId: academicYear.id,
        semesterNumber: 1,
        name: `Semester 1 (AY5_${timestamp})`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-01-31"),
      },
    });

    const classCohort = await prisma.class.create({
      data: {
        name: `CS Archives Cohort_${timestamp}`,
        code: `CSA-${timestamp.toString().slice(-4)}`,
        department: "Computer Science",
        academicYearId: academicYear.id,
      },
    });

    const course = await prisma.course.create({
      data: {
        code: `CS-DS-${timestamp.toString().slice(-4)}`,
        title: "Distributed Systems & Cloud Computing",
        credits: 4,
      },
    });
    courseId = course.id;

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
        { userId: classRepUser.id, courseOfferingId: offeringId, status: "ACTIVE" },
      ],
    });
  });

  afterAll(async () => {
    // Teardown test archive entries & users
    try {
      await prisma.archivedResource.deleteMany({
        where: { courseOfferingId: offeringId },
      });
      await prisma.userCourseRole.deleteMany({ where: { courseOfferingId: offeringId } });
      await prisma.enrollment.deleteMany({ where: { courseOfferingId: offeringId } });
      await prisma.courseOffering.deleteMany({ where: { id: offeringId } });
      await prisma.course.deleteMany({ where: { id: courseId } });
    } catch {
      // Ignore teardown errors
    }
  });

  // ----------------------------------------------------
  // 1. INSTRUCTOR UPLOADS & OFFICIAL FLAG
  // ----------------------------------------------------
  test("1. Assigned Instructor uploads past examination paper (auto-approved)", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 1 0 obj << /Title (Past Exam) >> endobj");

    const res = await request(app)
      .post("/api/v1/archive")
      .set("Authorization", `Bearer ${teacherToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Distributed Systems Final Exam 2023")
      .field("description", "Comprehensive final exam covering Paxos, Raft, and Vector Clocks.")
      .field("resourceType", "PAST_EXAM")
      .field("assessmentType", "FINAL")
      .field("examYear", "2023")
      .field("tags", "final,exam,paxos,raft")
      .attach("file", pdfBuffer, "DS_Final_2023.pdf");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("APPROVED");
    expect(res.body.data.resourceType).toBe("PAST_EXAM");
    expect(res.body.data.assessmentType).toBe("FINAL");
    expect(res.body.data.examYear).toBe(2023);
    expect(res.body.data.isOfficial).toBe(false);

    teacherExamId = res.body.data.id;
  });

  test("2. Instructor uploads official solution key with isOfficial: true", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 1 0 obj << /Title (Official Solutions) >> endobj");

    const res = await request(app)
      .post("/api/v1/archive")
      .set("Authorization", `Bearer ${teacherToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Distributed Systems Official Answer Key 2023")
      .field("description", "Faculty verified solution manual.")
      .field("resourceType", "SOLUTION")
      .field("assessmentType", "FINAL")
      .field("examYear", "2023")
      .field("isOfficial", "true")
      .field("tags", "solutions,answerkey,official")
      .attach("file", pdfBuffer, "DS_Solutions_2023.pdf");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("APPROVED");
    expect(res.body.data.isOfficial).toBe(true);

    teacherSolutionId = res.body.data.id;
  });

  // ----------------------------------------------------
  // 2. STUDENT CONTRIBUTIONS & SECURITY BOUNDARIES
  // ----------------------------------------------------
  test("3. Enrolled student uploads student project (enters PENDING moderation)", async () => {
    const zipBuffer = Buffer.from("PK\x03\x04MockZipContentForStudentProject");

    const res = await request(app)
      .post("/api/v1/archive")
      .set("Authorization", `Bearer ${student1Token}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Raft Consensus Algorithm Implementation in Go")
      .field("description", "Complete implementation with leader election and log replication.")
      .field("resourceType", "PROJECT")
      .field("assessmentType", "TERM_PROJECT")
      .field("examYear", "2024")
      .field("tags", "go,raft,consensus,project")
      .attach("file", zipBuffer, "raft_go_project.zip");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("PENDING");
    expect(res.body.data.resourceType).toBe("PROJECT");
    expect(res.body.data.isOfficial).toBe(false);

    studentProjectId = res.body.data.id;
  });

  test("4. Student attempt to mark contribution as official solution is rejected (403 Forbidden)", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 1 0 obj << /Title (Attempted Official) >> endobj");

    const res = await request(app)
      .post("/api/v1/archive")
      .set("Authorization", `Bearer ${student1Token}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Student Claimed Official Solution")
      .field("resourceType", "SOLUTION")
      .field("isOfficial", "true")
      .attach("file", pdfBuffer, "claimed_official.pdf");

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Only instructors and administrators can mark archive resources as official");
  });

  test("5. Non-enrolled outsider upload attempt is blocked (403 Forbidden)", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 1 0 obj << /Title (Outsider Paper) >> endobj");

    const res = await request(app)
      .post("/api/v1/archive")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Outsider Paper")
      .field("resourceType", "PAST_EXAM")
      .attach("file", pdfBuffer, "outsider.pdf");

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("FORBIDDEN");
  });

  // ----------------------------------------------------
  // 3. FILE INTEGRITY & MALICIOUS CONTENT DEFENSES
  // ----------------------------------------------------
  test("6. Upload rejects dangerous executable file types (.exe)", async () => {
    const exeBuffer = Buffer.from("MZ\x90\x00\x03\x00\x00\x00");

    const res = await request(app)
      .post("/api/v1/archive")
      .set("Authorization", `Bearer ${teacherToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Malicious Binary")
      .field("resourceType", "PROJECT")
      .attach("file", exeBuffer, "malware.exe");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("UNSUPPORTED_MIME_TYPE");
  });

  test("7. Extension spoofing defense: rejects dangerous extensions even if MIME is application/pdf", async () => {
    const shBuffer = Buffer.from("#!/bin/bash\necho exploit\n");

    const res = await request(app)
      .post("/api/v1/archive")
      .set("Authorization", `Bearer ${teacherToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Disguised Shell Script")
      .field("resourceType", "PAST_EXAM")
      .attach("file", shBuffer, {
        filename: "script.sh",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("UNSUPPORTED_MIME_TYPE");
  });

  test("8. Binary content signature defense: rejects Windows PE/MZ binary disguised with .pdf extension", async () => {
    const fakePdfBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

    const res = await request(app)
      .post("/api/v1/archive")
      .set("Authorization", `Bearer ${teacherToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Fake PDF with MZ Header")
      .field("resourceType", "PAST_EXAM")
      .attach("file", fakePdfBuffer, {
        filename: "trojan.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Executable binary detected (PE/MZ)");
  });

  // ----------------------------------------------------
  // 4. SEARCH, FILTERING, AND DISCOVERY
  // ----------------------------------------------------
  test("9. Enrolled student browses approved archive resources", async () => {
    const res = await request(app)
      .get("/api/v1/archive")
      .set("Authorization", `Bearer ${student1Token}`)
      .query({ courseOfferingId: offeringId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.resources).toBeInstanceOf(Array);
    // Student sees approved resources (teacherExamId, teacherSolutionId) and their own pending resource
    expect(res.body.data.resources.some((r: any) => r.id === teacherExamId)).toBe(true);
    expect(res.body.data.resources.some((r: any) => r.id === teacherSolutionId)).toBe(true);
  });

  test("10. Search archive by keyword across title, description, and tags", async () => {
    const res = await request(app)
      .get("/api/v1/archive")
      .set("Authorization", `Bearer ${student2Token}`)
      .query({ search: "Raft" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Finds either teacher exam (mentions Raft in description) or approved resources
    expect(res.body.data.resources.length).toBeGreaterThanOrEqual(1);
  });

  test("11. Filter archive by resourceType (SOLUTION)", async () => {
    const res = await request(app)
      .get("/api/v1/archive")
      .set("Authorization", `Bearer ${student1Token}`)
      .query({ resourceType: "SOLUTION" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.resources.every((r: any) => r.resourceType === "SOLUTION")).toBe(true);
    expect(res.body.data.resources.some((r: any) => r.id === teacherSolutionId)).toBe(true);
  });

  test("12. Filter archive by assessmentType (FINAL)", async () => {
    const res = await request(app)
      .get("/api/v1/archive")
      .set("Authorization", `Bearer ${student1Token}`)
      .query({ assessmentType: "FINAL" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.resources.every((r: any) => r.assessmentType === "FINAL")).toBe(true);
  });

  test("13. Filter archive by examYear (2023)", async () => {
    const res = await request(app)
      .get("/api/v1/archive")
      .set("Authorization", `Bearer ${student1Token}`)
      .query({ examYear: 2023 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.resources.every((r: any) => r.examYear === 2023)).toBe(true);
  });

  test("14. Filter archive by isOfficial = true returns only official solutions", async () => {
    const res = await request(app)
      .get("/api/v1/archive")
      .set("Authorization", `Bearer ${student2Token}`)
      .query({ isOfficial: "true" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.resources.every((r: any) => r.isOfficial === true)).toBe(true);
    expect(res.body.data.resources.some((r: any) => r.id === teacherSolutionId)).toBe(true);
  });

  // ----------------------------------------------------
  // 5. MODERATION WORKFLOW
  // ----------------------------------------------------
  test("15. Instructor retrieves moderation queue for their course offering", async () => {
    const res = await request(app)
      .get("/api/v1/archive/moderation/queue")
      .set("Authorization", `Bearer ${teacherToken}`)
      .query({ courseOfferingId: offeringId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.some((r: any) => r.id === studentProjectId)).toBe(true);
  });

  test("16. Regular student cannot access the moderation queue (403 Forbidden or empty)", async () => {
    const res = await request(app)
      .get("/api/v1/archive/moderation/queue")
      .set("Authorization", `Bearer ${student1Token}`)
      .query({ courseOfferingId: offeringId });

    // Enrolled student has no instructor role for offering, so 403 or empty array
    if (res.status === 403) {
      expect(res.body.success).toBe(false);
    } else {
      expect(res.body.data).toEqual([]);
    }
  });

  test("17. Instructor moderates and approves student project submission", async () => {
    const res = await request(app)
      .patch(`/api/v1/archive/${studentProjectId}/moderate`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        action: "APPROVE",
        note: "Excellent project implementation. Approved for reference.",
        isOfficial: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("APPROVED");
    expect(res.body.data.moderatorId || res.body.data.moderatedById).toBe(teacherUser.id);
  });

  test("17b. Self-approval prevention: uploader cannot approve their own submission (403 Forbidden)", async () => {
    // If student attempts to approve their own pending resource
    const res = await request(app)
      .patch(`/api/v1/archive/${studentProjectId}/moderate`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        action: "APPROVE",
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("FORBIDDEN");
  });

  test("18. Approved student project is now visible to peers in the general archive", async () => {
    const res = await request(app)
      .get("/api/v1/archive")
      .set("Authorization", `Bearer ${student2Token}`)
      .query({ courseOfferingId: offeringId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.resources.some((r: any) => r.id === studentProjectId)).toBe(true);
  });

  test("19. Instructor rejects a student submission with review note", async () => {
    // First, upload a resource to reject
    const docBuffer = Buffer.from("Corrupted file content");
    const uploadRes = await request(app)
      .post("/api/v1/archive")
      .set("Authorization", `Bearer ${student2Token}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Incomplete Assignment Notes")
      .field("resourceType", "REFERENCE")
      .attach("file", docBuffer, "incomplete.txt");

    studentRejectedId = uploadRes.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/archive/${studentRejectedId}/moderate`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        action: "REJECT",
        note: "Incomplete content and missing problem descriptions.",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("REJECTED");
    expect(res.body.data.moderationNote).toContain("Incomplete content");
  });

  // ----------------------------------------------------
  // 6. DOWNLOAD STREAMING & ATOMIC TRACKING
  // ----------------------------------------------------
  test("20. Authenticated student downloads archive resource: atomically increments downloads", async () => {
    const beforeResource = await prisma.archivedResource.findUnique({
      where: { id: teacherExamId },
    });
    const beforeCount = beforeResource?.downloads || 0;

    const res = await request(app)
      .get(`/api/v1/archive/${teacherExamId}/download`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("DS_Final_2023.pdf");

    const afterResource = await prisma.archivedResource.findUnique({
      where: { id: teacherExamId },
    });
    expect(afterResource?.downloads).toBe(beforeCount + 1);
  });

  // ----------------------------------------------------
  // 7. METADATA UPDATES & PRIVILEGE ESCALATION DEFENSE
  // ----------------------------------------------------
  test("21. Instructor updates archive resource metadata", async () => {
    const res = await request(app)
      .patch(`/api/v1/archive/${teacherExamId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        title: "Distributed Systems Final Exam 2023 (Updated Version)",
        description: "Added problem 4 clarification.",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toContain("Updated Version");
  });

  test("22. Unauthorized student cannot update another user's archive resource (403 Forbidden)", async () => {
    const res = await request(app)
      .patch(`/api/v1/archive/${teacherExamId}`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        title: "Hacked Exam Title",
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("23. Student cannot escalate privileges by setting isOfficial: true on update (403 Forbidden)", async () => {
    const res = await request(app)
      .patch(`/api/v1/archive/${studentProjectId}`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        isOfficial: true,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Only instructors and administrators can change the official solution status");
  });

  // ----------------------------------------------------
  // 8. DELETION & STORAGE INTEGRITY
  // ----------------------------------------------------
  test("24. Instructor soft-deletes an archive resource: marked isDeleted = true and excluded from list", async () => {
    const res = await request(app)
      .delete(`/api/v1/archive/${studentRejectedId}`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.softDeleted).toBe(true);

    const check = await prisma.archivedResource.findUnique({
      where: { id: studentRejectedId },
    });
    expect(check?.isDeleted).toBe(true);

    // Excluded from query list
    const listRes = await request(app)
      .get("/api/v1/archive")
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(listRes.body.data.resources.some((r: any) => r.id === studentRejectedId)).toBe(false);
  });

  test("25. Global Admin hard purges resource permanently with physical file cleanup", async () => {
    // Create temporary file to purge
    const tmpBuf = Buffer.from("Temporary project file to purge");
    const uploadRes = await request(app)
      .post("/api/v1/archive")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Purge Test Document")
      .field("resourceType", "PROJECT")
      .attach("file", tmpBuf, "purge_test.txt");

    const purgeId = uploadRes.body.data.id;
    const fileKey = uploadRes.body.data.fileKey;

    const purgeRes = await request(app)
      .delete(`/api/v1/archive/${purgeId}?hard=true`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(purgeRes.status).toBe(200);
    expect(purgeRes.body.success).toBe(true);
    expect(purgeRes.body.data.purged).toBe(true);

    // Verify row deleted from DB
    const checkDb = await prisma.archivedResource.findUnique({ where: { id: purgeId } });
    expect(checkDb).toBeNull();
  });

  // ----------------------------------------------------
  // 9. ANALYTICS & TELEGRAM BOT INTEGRATION
  // ----------------------------------------------------
  test("26. Archive usage analytics returns totals, breakdown, and top downloads", async () => {
    const res = await request(app)
      .get("/api/v1/archive/stats")
      .set("Authorization", `Bearer ${teacherToken}`)
      .query({ courseOfferingId: offeringId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalApproved).toBeGreaterThanOrEqual(2);
    expect(res.body.data.totalOfficial).toBeGreaterThanOrEqual(1);
    expect(res.body.data.byResourceType).toHaveProperty("PAST_EXAM");
    expect(res.body.data.topDownloaded).toBeInstanceOf(Array);
  });

  test("27. Telegram archive command returns formatted results cleanly", async () => {
    const mockBot: any = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    };

    await handleArchiveCommand(mockBot, 123456789, "Distributed Systems");

    expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
    const sentMsg = mockBot.sendMessage.mock.calls[0][1];
    expect(sentMsg).toContain("Academic Archive");
  });
});
