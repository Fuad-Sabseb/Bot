import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { generateAccessToken } from "../src/utils/jwt";
import { ReminderService } from "../src/services/reminder.service";

const app = createApp();

describe("Phase 3 — Assignment and Deadline Management System", () => {
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
  let individualAssignmentId: string;
  let groupAssignmentId: string;
  let individualSubmissionId: string;
  let groupSubmissionId: string;
  let createdGroupId: string;

  beforeAll(async () => {
    const timestamp = Date.now();

    // 1. Create Admin
    adminUser = await prisma.user.create({
      data: {
        fullName: "System Admin",
        email: `admin_p3_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "ADMIN" } },
      },
    });
    const adminSession = await prisma.session.create({ data: { userId: adminUser.id } });
    adminToken = generateAccessToken({ userId: adminUser.id, sessionId: adminSession.id });

    // 2. Create Teacher
    teacherUser = await prisma.user.create({
      data: {
        fullName: "Dr. Grace Hopper",
        email: `hopper_p3_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const teacherSession = await prisma.session.create({ data: { userId: teacherUser.id } });
    teacherToken = generateAccessToken({ userId: teacherUser.id, sessionId: teacherSession.id });

    // 3. Create Class Rep
    classRepUser = await prisma.user.create({
      data: {
        fullName: "Clara ClassRep",
        campusId: `CR_${timestamp}`,
        email: `classrep_p3_${timestamp}@university.edu`,
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
        campusId: `S1_${timestamp}`,
        email: `alice_p3_${timestamp}@university.edu`,
        isActive: true,
        telegramChatId: BigInt(Math.floor(Math.random() * 899999999 + 100000000)),
        globalRoles: { create: { role: "USER" } },
      },
    });
    const student1Session = await prisma.session.create({ data: { userId: student1User.id } });
    student1Token = generateAccessToken({ userId: student1User.id, sessionId: student1Session.id });

    student2User = await prisma.user.create({
      data: {
        fullName: "Bob Student",
        campusId: `S2_${timestamp}`,
        email: `bob_p3_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const student2Session = await prisma.session.create({ data: { userId: student2User.id } });
    student2Token = generateAccessToken({ userId: student2User.id, sessionId: student2Session.id });

    // 5. Create Outsider (not enrolled)
    outsiderUser = await prisma.user.create({
      data: {
        fullName: "Oscar Outsider",
        campusId: `OUT_${timestamp}`,
        email: `outsider_p3_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const outsiderSession = await prisma.session.create({ data: { userId: outsiderUser.id } });
    outsiderToken = generateAccessToken({ userId: outsiderUser.id, sessionId: outsiderSession.id });

    // 6. Create Academic Hierarchy
    const academicYear = await prisma.academicYear.create({
      data: {
        name: `AY3_${timestamp}`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
      },
    });

    const semester = await prisma.semester.create({
      data: {
        academicYearId: academicYear.id,
        semesterNumber: 1,
        name: `Semester 1_${timestamp}`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-01-31"),
      },
    });

    const classCohort = await prisma.class.create({
      data: {
        name: `CS Cohort 2027_${timestamp}`,
        code: `CS-${timestamp.toString().slice(-4)}`,
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
  // 1. ASSIGNMENT CREATION & AUTHORIZATION
  // ==========================================

  test("1. Assigned Teacher creates INDIVIDUAL assignment with attachment", async () => {
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    const cutoffDate = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000); // 9 days from now

    const res = await request(app)
      .post("/api/v1/assignments")
      .set("Authorization", `Bearer ${teacherToken}`)
      .field("courseOfferingId", offeringId)
      .field("title", "Distributed Key-Value Store Assignment")
      .field("description", "Implement a Raft-based replicated state machine.")
      .field("instructions", "Submit single PDF report or ZIP with source code.")
      .field("type", "INDIVIDUAL")
      .field("maxMarks", 100)
      .field("dueDate", dueDate.toISOString())
      .field("cutoffDate", cutoffDate.toISOString())
      .field("allowResubmission", "true")
      .attach("attachments", Buffer.from("Starter specification document"), "specs.pdf");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.title).toBe("Distributed Key-Value Store Assignment");
    expect(res.body.data.attachments.length).toBe(1);
    expect(res.body.data.attachments[0].fileName).toBe("specs.pdf");

    individualAssignmentId = res.body.data.id;
  });

  test("2. Class Representative creates GROUP assignment", async () => {
    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const res = await request(app)
      .post("/api/v1/assignments")
      .set("Authorization", `Bearer ${classRepToken}`)
      .send({
        courseOfferingId: offeringId,
        title: "Cloud Infrastructure Group Project",
        description: "Deploy a Kubernetes cluster and microservices architecture.",
        type: "GROUP",
        minGroupSize: 2,
        maxGroupSize: 4,
        maxMarks: 50,
        dueDate: dueDate.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe("GROUP");
    expect(res.body.data.minGroupSize).toBe(2);
    expect(res.body.data.maxGroupSize).toBe(4);

    groupAssignmentId = res.body.data.id;
  });

  test("3. Regular student is blocked from creating an assignment (403 Forbidden)", async () => {
    const res = await request(app)
      .post("/api/v1/assignments")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        courseOfferingId: offeringId,
        title: "Unauthorized Student Assignment",
        description: "Should fail.",
        dueDate: new Date().toISOString(),
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("4. Assignment creation rejects invalid cutoff date earlier than due date", async () => {
    const now = Date.now();
    const res = await request(app)
      .post("/api/v1/assignments")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        courseOfferingId: offeringId,
        title: "Invalid Dates Assignment",
        description: "Testing date validation.",
        dueDate: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
        cutoffDate: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(), // Earlier than due date!
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("INVALID_CUTOFF_DATE");
  });

  // ==========================================
  // 2. STUDENT DASHBOARD & COUNTDOWNS
  // ==========================================

  test("5. Enrolled student views assignment dashboard with upcoming countdowns", async () => {
    const res = await request(app)
      .get("/api/v1/assignments/dashboard/student")
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary.upcoming).toBeGreaterThanOrEqual(2);
    expect(res.body.data.categories.upcoming.length).toBeGreaterThanOrEqual(2);

    const individual = res.body.data.categories.upcoming.find(
      (a: any) => a.id === individualAssignmentId
    );
    expect(individual).toBeDefined();
    expect(individual.status).toBe("UPCOMING");
    expect(individual.timeRemainingText).toContain("remaining");
  });

  // ==========================================
  // 3. INDIVIDUAL SUBMISSION & VERSIONING
  // ==========================================

  test("6. Enrolled student submits individual assignment (Version 1)", async () => {
    const res = await request(app)
      .post(`/api/v1/assignments/${individualAssignmentId}/submit`)
      .set("Authorization", `Bearer ${student1Token}`)
      .attach("file", Buffer.from("Initial solution for Raft K-V store"), "solution_v1.pdf");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.isCurrentVersion).toBe(true);
    expect(res.body.data.status).toBe("SUBMITTED");
    expect(res.body.data.studentId).toBe(student1User.id);
    expect(res.body.data.groupId).toBeNull();

    individualSubmissionId = res.body.data.id;
  });

  test("7. Student resubmits individual assignment: increments version to 2 and archives v1", async () => {
    const res = await request(app)
      .post(`/api/v1/assignments/${individualAssignmentId}/submit`)
      .set("Authorization", `Bearer ${student1Token}`)
      .attach("file", Buffer.from("Refactored solution for Raft K-V store v2"), "solution_v2.pdf");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version).toBe(2);
    expect(res.body.data.isCurrentVersion).toBe(true);

    // Verify v1 is now not current
    const v1 = await prisma.assignmentSubmission.findUnique({
      where: { id: individualSubmissionId },
    });
    expect(v1?.isCurrentVersion).toBe(false);

    individualSubmissionId = res.body.data.id;
  });

  test("8. Student checks personal submission history", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${individualAssignmentId}/submissions/my`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].version).toBe(2);
    expect(res.body.data[1].version).toBe(1);
  });

  test("9. Non-enrolled outsider cannot submit to assignment (403 Forbidden)", async () => {
    const res = await request(app)
      .post(`/api/v1/assignments/${individualAssignmentId}/submit`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .attach("file", Buffer.from("Malicious attempt"), "hack.pdf");

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ==========================================
  // 4. GROUP MANAGEMENT & GROUP SUBMISSION
  // ==========================================

  test("10. Enrolled student creates a group for group assignment (becomes leader)", async () => {
    const res = await request(app)
      .post(`/api/v1/assignments/${groupAssignmentId}/groups`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ name: "Cloud Pioneers Team" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Cloud Pioneers Team");
    expect(res.body.data.members.length).toBe(1);
    expect(res.body.data.members[0].userId).toBe(student1User.id);
    expect(res.body.data.members[0].isLeader).toBe(true);

    createdGroupId = res.body.data.id;
  });

  test("11. Duplicate group name on same assignment is rejected", async () => {
    const res = await request(app)
      .post(`/api/v1/assignments/${groupAssignmentId}/groups`)
      .set("Authorization", `Bearer ${student2Token}`)
      .send({ name: "Cloud Pioneers Team" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("GROUP_NAME_TAKEN");
  });

  test("12. Second student joins the group", async () => {
    const res = await request(app)
      .post(`/api/v1/assignments/${groupAssignmentId}/groups/${createdGroupId}/join`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(student2User.id);
  });

  test("13. Student already in a group cannot join another group for the same assignment", async () => {
    const res = await request(app)
      .post(`/api/v1/assignments/${groupAssignmentId}/groups/${createdGroupId}/join`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ALREADY_IN_GROUP");
  });

  test("14. Group member submits file for the group: locks group against new members", async () => {
    const res = await request(app)
      .post(`/api/v1/assignments/${groupAssignmentId}/submit`)
      .set("Authorization", `Bearer ${student1Token}`)
      .attach("file", Buffer.from("Kubernetes Architecture Group Project Report"), "k8s_report.pdf");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.groupId).toBe(createdGroupId);
    expect(res.body.data.studentId).toBeNull();
    expect(res.body.data.version).toBe(1);

    groupSubmissionId = res.body.data.id;

    // Verify group is locked
    const group = await prisma.assignmentGroup.findUnique({
      where: { id: createdGroupId },
    });
    expect(group?.isLocked).toBe(true);
  });

  test("15. Joining locked group is blocked (GROUP_LOCKED)", async () => {
    // Attempt with outsider after enrolling them
    await prisma.enrollment.create({
      data: { userId: outsiderUser.id, courseOfferingId: offeringId, status: "ACTIVE" },
    });

    const res = await request(app)
      .post(`/api/v1/assignments/${groupAssignmentId}/groups/${createdGroupId}/join`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("GROUP_LOCKED");
  });

  // ==========================================
  // 5. DEADLINE & CUTOFF ENFORCEMENT
  // ==========================================

  test("16. Submission past cutoff date is rejected (DEADLINE_PASSED)", async () => {
    // Create an assignment whose deadline and cutoff are in the past
    const pastAssignment = await prisma.assignment.create({
      data: {
        courseOfferingId: offeringId,
        title: "Expired Past Assignment",
        description: "Deadline already passed.",
        assignedById: teacherUser.id,
        dueDate: new Date(Date.now() - 3600000), // 1 hour ago
        cutoffDate: new Date(Date.now() - 1800000), // 30 mins ago
      },
    });

    const res = await request(app)
      .post(`/api/v1/assignments/${pastAssignment.id}/submit`)
      .set("Authorization", `Bearer ${student1Token}`)
      .attach("file", Buffer.from("Late attempt"), "late.pdf");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("DEADLINE_PASSED");
  });

  test("17. Submission between dueDate and cutoffDate gets LATE_SUBMITTED status", async () => {
    const lateGraceAssignment = await prisma.assignment.create({
      data: {
        courseOfferingId: offeringId,
        title: "Late Grace Assignment",
        description: "Due date passed, cutoff still open.",
        assignedById: teacherUser.id,
        dueDate: new Date(Date.now() - 3600000), // 1 hour ago
        cutoffDate: new Date(Date.now() + 3600000), // 1 hour from now
      },
    });

    const res = await request(app)
      .post(`/api/v1/assignments/${lateGraceAssignment.id}/submit`)
      .set("Authorization", `Bearer ${student1Token}`)
      .attach("file", Buffer.from("Late submission during grace window"), "grace.pdf");

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("LATE_SUBMITTED");
  });

  // ==========================================
  // 6. TEACHER GRADING & STUDENT PRIVACY
  // ==========================================

  test("18. Assigned Teacher lists all submissions for grading", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${individualAssignmentId}/submissions`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].student.id).toBe(student1User.id);
  });

  test("19. Teacher grades individual submission: records grade, feedback and dispatches notification", async () => {
    const res = await request(app)
      .patch(`/api/v1/assignments/${individualAssignmentId}/submissions/${individualSubmissionId}/grade`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        grade: 96.5,
        feedback: "Outstanding implementation of consensus protocol! Clear tests and documentation.",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.grade).toBe(96.5);
    expect(res.body.data.status).toBe("GRADED");
    expect(res.body.data.feedback).toContain("Outstanding");

    // Verify student received GRADE_RELEASED notification
    const notifications = await prisma.notification.findMany({
      where: { userId: student1User.id, type: "GRADE_RELEASED" },
    });
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].title).toContain("Grade Released");
  });

  test("20. Grading rejects marks exceeding maxMarks", async () => {
    const res = await request(app)
      .patch(`/api/v1/assignments/${individualAssignmentId}/submissions/${individualSubmissionId}/grade`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ grade: 105 }); // maxMarks is 100

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("INVALID_GRADE");
  });

  test("21. Class Representative is denied permission to grade (403 Forbidden)", async () => {
    const res = await request(app)
      .patch(`/api/v1/assignments/${individualAssignmentId}/submissions/${individualSubmissionId}/grade`)
      .set("Authorization", `Bearer ${classRepToken}`)
      .send({ grade: 80 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("22. Student dashboard now displays the graded assignment in the GRADED category", async () => {
    const res = await request(app)
      .get("/api/v1/assignments/dashboard/student")
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.categories.graded.length).toBeGreaterThanOrEqual(1);

    const gradedItem = res.body.data.categories.graded.find(
      (a: any) => a.id === individualAssignmentId
    );
    expect(gradedItem).toBeDefined();
    expect(gradedItem.status).toBe("GRADED");
    expect(gradedItem.submission.grade).toBe(96.5);
    expect(gradedItem.submission.feedback).toContain("Outstanding");
  });

  // ==========================================
  // 7. NOTIFICATIONS & PREFERENCES
  // ==========================================

  test("23. Student retrieves notifications and updates notification preferences", async () => {
    // 1. Get notifications
    const resNotes = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${student1Token}`);

    expect(resNotes.status).toBe(200);
    expect(resNotes.body.success).toBe(true);
    expect(resNotes.body.data.notifications.length).toBeGreaterThanOrEqual(1);
    expect(resNotes.body.data.unreadCount).toBeGreaterThanOrEqual(1);

    const noteId = resNotes.body.data.notifications[0].id;

    // 2. Mark single notification as read
    const resRead = await request(app)
      .patch(`/api/v1/notifications/${noteId}/read`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(resRead.status).toBe(200);
    expect(resRead.body.data.isRead).toBe(true);

    // 3. Update preferences
    const resPref = await request(app)
      .patch("/api/v1/notifications/preferences")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ remind2Hours: false });

    expect(resPref.status).toBe(200);
    expect(resPref.body.data.remind2Hours).toBe(false);
  });

  test("24. ReminderService processes due reminders cleanly without error", async () => {
    const stats = await ReminderService.processDueReminders();
    expect(stats).toBeDefined();
    expect(typeof stats.processed).toBe("number");
    expect(typeof stats.sent).toBe("number");
  });

  // ==========================================
  // 8. SECURE FILE ACCESS & AUTHORIZATION
  // ==========================================

  test("25. Submitting student can securely download their own submission", async () => {
    const submission = await prisma.assignmentSubmission.findUnique({
      where: { id: individualSubmissionId },
    });

    const res = await request(app)
      .get(`/api/v1/assignments/files/download?fileKey=${encodeURIComponent(submission!.fileKey)}`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.header["content-disposition"]).toContain("attachment");
    expect(res.text).toBe("Refactored solution for Raft K-V store v2");
  });

  test("26. Unrelated student is blocked from downloading another student's submission (403)", async () => {
    const submission = await prisma.assignmentSubmission.findUnique({
      where: { id: individualSubmissionId },
    });

    const res = await request(app)
      .get(`/api/v1/assignments/files/download?fileKey=${encodeURIComponent(submission!.fileKey)}`)
      .set("Authorization", `Bearer ${student2Token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("27. Assigned Teacher can download student's submission file", async () => {
    const submission = await prisma.assignmentSubmission.findUnique({
      where: { id: individualSubmissionId },
    });

    const res = await request(app)
      .get(`/api/v1/assignments/files/download?fileKey=${encodeURIComponent(submission!.fileKey)}`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.header["content-disposition"]).toContain("attachment");
  });
});
