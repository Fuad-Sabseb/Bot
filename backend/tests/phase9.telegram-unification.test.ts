import { prisma } from "../src/database/prisma";
import { handleCoursesCommand } from "../src/modules/telegram/handlers/courses.handler";
import { handleAssignmentsCommand } from "../src/modules/telegram/handlers/assignment.handler";
import { handleMaterialsCommand } from "../src/modules/telegram/handlers/materials.handler";
import {
  handleSettingsCommand,
  handleSettingsToggle,
} from "../src/modules/telegram/handlers/settings.handler";
import { handleProfileCommand } from "../src/modules/telegram/handlers/profile.handler";
import {
  handleAnnouncementsCommand,
  handleAnnouncementBroadcast,
} from "../src/modules/telegram/handlers/announcement.handler";
import { UsersService } from "../src/modules/users/users.service";
import { ReminderService } from "../src/services/reminder.service";
import { ReminderInterval, ReminderStatus, CourseRole } from "@prisma/client";

// Mock TelegramBot test helper
function createMockBot() {
  const sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  const editedMessages: Array<{ text: string; options?: any }> = [];

  return {
    sendMessage: jest.fn(async (chatId: number, text: string, options?: any) => {
      sentMessages.push({ chatId, text, options });
      return { message_id: 2001 };
    }),
    editMessageText: jest.fn(async (text: string, options?: any) => {
      editedMessages.push({ text, options });
      return true;
    }),
    answerCallbackQuery: jest.fn(async () => true),
    getSentMessages: () => sentMessages,
    getEditedMessages: () => editedMessages,
  };
}

describe("Phase 9 — Telegram Bot and Website Unification", () => {
  const ts = Date.now();
  const studentChatId = BigInt(ts + 101);
  const adminChatId = BigInt(ts + 999);
  const unlinkedChatId = BigInt(ts + 555);

  let testStudentUser: any;
  let testAdminUser: any;
  let testOffering: any;
  let testAssignment: any;
  let testMaterial: any;

  async function cleanPhase9Data() {
    try {
      await prisma.scheduledReminder.deleteMany({
        where: { user: { email: { contains: "_p9_" } } },
      });
      await prisma.assignmentSubmission.deleteMany({
        where: { student: { email: { contains: "_p9_" } } },
      });
      await prisma.learningMaterial.deleteMany({
        where: { uploader: { email: { contains: "_p9_" } } },
      });
      await prisma.assignment.deleteMany({
        where: { assignedBy: { email: { contains: "_p9_" } } },
      });
      await prisma.announcement.deleteMany({
        where: { author: { email: { contains: "_p9_" } } },
      });
      await prisma.enrollment.deleteMany({
        where: { user: { email: { contains: "_p9_" } } },
      });
      await prisma.userCourseRole.deleteMany({
        where: { user: { email: { contains: "_p9_" } } },
      });
      await prisma.notificationPreference.deleteMany({
        where: { user: { email: { contains: "_p9_" } } },
      });
      await prisma.user.deleteMany({
        where: { email: { contains: "_p9_" } },
      });
    } catch {
      // Ignore cleanup error
    }
  }

  beforeAll(async () => {
    // 1. Clean up potential old test data
    await cleanPhase9Data();

    // 2. Setup Academic Hierarchy
    const academicYear = await prisma.academicYear.create({
      data: {
        name: `Phase9 Year ${ts}`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
      },
    });

    const semester = await prisma.semester.create({
      data: {
        academicYearId: academicYear.id,
        semesterNumber: 1,
        name: `Fall P9 ${ts}`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-01-31"),
      },
    });

    const cls = await prisma.class.create({
      data: {
        academicYearId: academicYear.id,
        name: `CS-P9-${ts}`,
        code: `CSP9_${ts.toString().slice(-4)}`,
        department: "Computer Science",
      },
    });

    const course = await prisma.course.create({
      data: {
        code: `CS901_${ts.toString().slice(-4)}`,
        title: "Distributed Supercomputing & Telegram Architecture",
        credits: 4,
      },
    });

    // Create Admin User
    testAdminUser = await prisma.user.create({
      data: {
        email: `admin_p9_${ts}@campus.edu`,
        fullName: "Dr. Phase 9 Admin",
        telegramChatId: adminChatId,
        telegramUsername: `admin_p9_${ts}`,
        isActive: true,
        globalRoles: { create: { role: "ADMIN" } },
      },
    });

    // Create Student User
    testStudentUser = await prisma.user.create({
      data: {
        campusId: `P9/${ts.toString().slice(-4)}`,
        email: `student_p9_${ts}@campus.edu`,
        fullName: "Unified Student Nine",
        telegramChatId: studentChatId,
        telegramUsername: `student_p9_${ts}`,
        isActive: true,
        primaryClassId: cls.id,
        globalRoles: { create: { role: "USER" } },
      },
    });

    // Create Course Offering
    testOffering = await prisma.courseOffering.create({
      data: {
        courseId: course.id,
        semesterId: semester.id,
        classId: cls.id,
      },
    });

    // Assign Admin as Instructor
    await prisma.userCourseRole.create({
      data: {
        userId: testAdminUser.id,
        courseOfferingId: testOffering.id,
        role: CourseRole.INSTRUCTOR,
      },
    });

    // Enroll Student
    await prisma.enrollment.create({
      data: {
        userId: testStudentUser.id,
        courseOfferingId: testOffering.id,
        status: "ACTIVE",
      },
    });

    // Create Active Assignment
    testAssignment = await prisma.assignment.create({
      data: {
        courseOfferingId: testOffering.id,
        title: "Distributed Telegram Protocol Engine",
        description: "Implement unified RPC protocol.",
        assignedById: testAdminUser.id,
        type: "INDIVIDUAL",
        dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000), // 2 days in future
        maxMarks: 100,
      },
    });

    // Create Approved Learning Material
    testMaterial = await prisma.learningMaterial.create({
      data: {
        courseOfferingId: testOffering.id,
        title: "Telegram Bot Architecture Lecture Notes",
        category: "LECTURE_SLIDES",
        uploaderId: testAdminUser.id,
        fileName: "telegram_arch_notes.pdf",
        fileKey: "materials/test_arch_notes.pdf",
        fileUrl: "/api/v1/materials/download/mock_p9_file",
        fileSize: 2048576, // 2MB
        mimeType: "application/pdf",
        status: "APPROVED",
        tags: "telegram,architecture,unification",
      },
    });
  });

  afterAll(async () => {
    await cleanPhase9Data();
  });

  test("1. /courses: Returns unlinked account guidance for unregistered Telegram user", async () => {
    const mockBot = createMockBot();
    await handleCoursesCommand(mockBot as any, unlinkedChatId);

    const msgs = mockBot.getSentMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toContain("My Enrolled Courses");
    expect(msgs[0].text).toContain("not yet linked");
    expect(msgs[0].text).toContain("/link <6-digit-otp>");
  });

  test("2. /courses: Returns enrolled course details and instructor for linked student", async () => {
    const mockBot = createMockBot();
    await handleCoursesCommand(mockBot as any, studentChatId);

    const msgs = mockBot.getSentMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toContain("Distributed Supercomputing");
    expect(msgs[0].text).toContain(testStudentUser.fullName);
    expect(msgs[0].text).toContain("Dr. Phase 9 Admin");
  });

  test("3. /assignments: Returns active assignment with deadline countdown and status", async () => {
    const mockBot = createMockBot();
    await handleAssignmentsCommand(mockBot as any, studentChatId);

    const msgs = mockBot.getSentMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toContain("Distributed Telegram Protocol Engine");
    expect(msgs[0].text).toContain("Due in 2 days");
    expect(msgs[0].text).toContain("Pending Submission");
  });

  test("4. /assignments: Shows updated status when student has submitted", async () => {
    // Create submission
    await prisma.assignmentSubmission.create({
      data: {
        assignmentId: testAssignment.id,
        studentId: testStudentUser.id,
        status: "GRADED",
        grade: 96,
        version: 1,
        isCurrentVersion: true,
        fileKey: "storage/test_sub.zip",
        fileName: "sub.zip",
        fileSize: 1024,
        fileUrl: "/api/v1/assignments/submissions/sub.zip",
        mimeType: "application/zip",
      },
    });

    const mockBot = createMockBot();
    await handleAssignmentsCommand(mockBot as any, studentChatId);

    const msgs = mockBot.getSentMessages();
    expect(msgs[0].text).toContain("Graded: 96/100 pts");
  });

  test("5. /materials: Lists approved study materials for enrolled courses", async () => {
    const mockBot = createMockBot();
    await handleMaterialsCommand(mockBot as any, studentChatId);

    const msgs = mockBot.getSentMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toContain("Telegram Bot Architecture Lecture Notes");
    expect(msgs[0].text).toContain("LECTURE_SLIDES");
    expect(msgs[0].text).toContain("MB");
  });

  test("6. /materials <query>: Filters materials matching keyword", async () => {
    const mockBot = createMockBot();
    await handleMaterialsCommand(mockBot as any, studentChatId, "telegram");

    const msgs = mockBot.getSentMessages();
    expect(msgs[0].text).toContain("Filter: \"*telegram*\"");
    expect(msgs[0].text).toContain("Telegram Bot Architecture");
  });

  test("7. /settings: Retrieves and displays default notification preferences", async () => {
    const mockBot = createMockBot();
    await handleSettingsCommand(mockBot as any, studentChatId);

    const msgs = mockBot.getSentMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toContain("Notification & Reminder Preferences");
    expect(msgs[0].text).toContain("3-Day Reminder:* ✅ Active");
    expect(msgs[0].text).toContain("24-Hour Reminder:* ✅ Active");
    expect(msgs[0].text).toContain("Telegram Delivery:* ✅ Enabled");
  });

  test("8. /settings toggle: Toggles reminder preference and persists immediately", async () => {
    const mockBot = createMockBot();

    // Toggle 3-day reminder off
    await handleSettingsToggle(mockBot as any, studentChatId, 101, "toggle_remind_3d");

    // Verify DB update
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId: testStudentUser.id },
    });
    expect(pref?.remind3Days).toBe(false);

    // Toggle back on
    await handleSettingsToggle(mockBot as any, studentChatId, 101, "toggle_remind_3d");
    const prefRestored = await prisma.notificationPreference.findUnique({
      where: { userId: testStudentUser.id },
    });
    expect(prefRestored?.remind3Days).toBe(true);
  });

  test("9. /profile: Returns full verified student profile with campus ID and quota", async () => {
    const mockBot = createMockBot();
    await handleProfileCommand(mockBot as any, studentChatId);

    const msgs = mockBot.getSentMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toContain(testStudentUser.fullName);
    expect(msgs[0].text).toContain(testStudentUser.campusId);
    expect(msgs[0].text).toContain("Verified & Synchronized with University Portal");
    expect(msgs[0].text).toContain("AI Assistant Quota");
  });

  test("10. /announcements: Displays latest announcements to student", async () => {
    await prisma.announcement.create({
      data: {
        authorId: testAdminUser.id,
        title: "Midterm Room Allocation",
        content: "Midterm examination will be held in Hall B-101 at 09:00 AM.",
        priority: "HIGH",
      },
    });

    const mockBot = createMockBot();
    await handleAnnouncementsCommand(mockBot as any, studentChatId);

    const msgs = mockBot.getSentMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toContain("Midterm Room Allocation");
    expect(msgs[0].text).toContain("Hall B-101");
  });

  test("11. Admin announcement broadcast: Persists and sends to registered students", async () => {
    const mockBot = createMockBot();
    await handleAnnouncementBroadcast(
      mockBot as any,
      Number(adminChatId),
      "Emergency Maintenance: Library server upgrade tonight."
    );

    const msgs = mockBot.getSentMessages();
    // Admin receives confirmation
    expect(msgs.some((m) => m.text.includes("Broadcast sent"))).toBe(true);
    // Student receives the broadcast
    expect(
      msgs.some((m) => m.chatId === Number(studentChatId) && m.text.includes("Library server upgrade"))
    ).toBe(true);
  });

  test("12. Account Linking Flow: OTP generation and verification links Telegram account", async () => {
    // Create new unlinked student user on web
    const newStudent = await prisma.user.create({
      data: {
        campusId: `P9/LINK_${ts.toString().slice(-4)}`,
        email: `link_student_${ts}@campus.edu`,
        fullName: "Link Test Student",
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });

    // 1. Web client generates link token
    const tokenInfo = UsersService.generateTelegramLinkToken(newStudent.id);
    expect(tokenInfo.otp).toBeDefined();
    expect(tokenInfo.otp.length).toBe(6);

    // 2. Student runs /link <otp> in Telegram
    const targetChatId = BigInt(ts + 8888);
    await prisma.user.deleteMany({
      where: { telegramChatId: targetChatId },
    });
    const linkResult = await UsersService.verifyTelegramLinkToken(
      tokenInfo.otp,
      targetChatId,
      `linked_tg_${ts}`
    );

    expect(linkResult.success).toBe(true);
    expect(linkResult.user.id).toBe(newStudent.id);
    expect(linkResult.user.telegramChatId).toBe(targetChatId.toString());

    // 3. Verify in database
    const dbUser = await prisma.user.findUnique({ where: { id: newStudent.id } });
    expect(dbUser?.telegramChatId).toBe(targetChatId);
    expect(dbUser?.telegramUsername).toBe(`linked_tg_${ts}`);
    expect(dbUser?.isVerified).toBe(true);
  });

  test("13. ReminderService: Correctly dispatches Telegram notification when scheduled reminder is due", async () => {
    // Create a new assignment due in 1 day
    const urgentAssignment = await prisma.assignment.create({
      data: {
        courseOfferingId: testOffering.id,
        title: "Urgent Phase 9 Test Assignment",
        description: "Due very soon.",
        assignedById: testAdminUser.id,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Schedule a reminder due right now
    const reminder = await prisma.scheduledReminder.create({
      data: {
        assignmentId: urgentAssignment.id,
        userId: testStudentUser.id,
        interval: ReminderInterval.ONE_DAY,
        scheduledFor: new Date(Date.now() - 1000), // Due in the past (now)
        status: ReminderStatus.PENDING,
      },
    });

    // Process due reminders
    const result = await ReminderService.processDueReminders();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    // Verify reminder is now SENT in database
    const updatedReminder = await prisma.scheduledReminder.findUnique({
      where: { id: reminder.id },
    });
    expect(updatedReminder?.status).toBe(ReminderStatus.SENT);
  });
});
