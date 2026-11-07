import { PrismaClient } from "@prisma/client";

const testDbUrl = process.env.TEST_DATABASE_URL || "postgresql://fuad.s@127.0.0.1:5432/campus_app_test?schema=public";
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

describe("Database & PostgreSQL Schema Custom Constraints", () => {
  let academicYearId: string;
  let semesterId: string;
  let classId: string;
  let courseId: string;
  let offeringId: string;
  let student1Id: string;
  let teacherId: string;
  let assignmentId: string;
  let groupId: string;

  beforeAll(async () => {
    // Clean test database tables
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "Class", "Course", "AcademicYear" CASCADE;`);

    // Verify vector extension is enabled in PostgreSQL
    const vectorCheck: any[] = await prisma.$queryRaw`SELECT extname FROM pg_extension WHERE extname = 'vector';`;
    expect(vectorCheck.length).toBe(1);
    expect(vectorCheck[0].extname).toBe("vector");

    // Seed academic scaffolding
    const year = await prisma.academicYear.create({
      data: {
        name: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
        isCurrent: true,
      },
    });
    academicYearId = year.id;

    const sem = await prisma.semester.create({
      data: {
        academicYearId,
        semesterNumber: 1,
        name: "Fall 2026",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-01-30"),
        isCurrent: true,
      },
    });
    semesterId = sem.id;

    const cls = await prisma.class.create({
      data: {
        name: "Software Engineering 2027",
        code: "SE-2027",
        department: "Computer Science",
        academicYearId,
      },
    });
    classId = cls.id;

    const crs = await prisma.course.create({
      data: {
        title: "Database Systems",
        code: "CS302",
        credits: 3,
      },
    });
    courseId = crs.id;

    const offering = await prisma.courseOffering.create({
      data: {
        courseId,
        semesterId,
        classId,
      },
    });
    offeringId = offering.id;

    const teacher = await prisma.user.create({
      data: {
        fullName: "Dr. Professor",
        email: "prof@university.edu",
        globalRoles: { create: { role: "USER" } },
      },
    });
    teacherId = teacher.id;

    const student1 = await prisma.user.create({
      data: {
        fullName: "Student One",
        campusId: "RU0001/17",
        globalRoles: { create: { role: "USER" } },
      },
    });
    student1Id = student1.id;

    const asgn = await prisma.assignment.create({
      data: {
        courseOfferingId: offeringId,
        title: "Assignment 1",
        description: "Normalization lab",
        assignedById: teacherId,
        dueDate: new Date(Date.now() + 86400000),
        maxMarks: 100,
        type: "INDIVIDUAL",
      },
    });
    assignmentId = asgn.id;

    const grp = await prisma.assignmentGroup.create({
      data: {
        assignmentId,
        name: "Alpha Team",
        createdById: student1Id,
      },
    });
    groupId = grp.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("1. Single current academic year partial unique index prevents two active years", async () => {
    await expect(
      prisma.academicYear.create({
        data: {
          name: "2027/2028",
          startDate: new Date("2027-09-01"),
          endDate: new Date("2028-06-30"),
          isCurrent: true, // Should violate idx_single_current_academic_year
        },
      })
    ).rejects.toThrow();
  });

  test("2. Single current semester partial unique index prevents two active semesters", async () => {
    await expect(
      prisma.semester.create({
        data: {
          academicYearId,
          semesterNumber: 2,
          name: "Spring 2027",
          startDate: new Date("2027-02-01"),
          endDate: new Date("2027-06-30"),
          isCurrent: true, // Should violate idx_single_current_semester
        },
      })
    ).rejects.toThrow();
  });

  test("3. AssignmentSubmission owner XOR CHECK constraint: fails if BOTH studentId and groupId are populated", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "AssignmentSubmission" (
          id, "assignmentId", "studentId", "groupId", version, "isCurrentVersion",
          "fileKey", "fileUrl", "fileName", "fileSize", "mimeType", status, "submittedAt"
        ) VALUES (
          gen_random_uuid(), ${assignmentId}, ${student1Id}, ${groupId}, 1, true,
          'key1', 'url1', 'doc.pdf', 1024, 'application/pdf', 'SUBMITTED', NOW()
        );
      `
    ).rejects.toThrow();
  });

  test("4. AssignmentSubmission owner XOR CHECK constraint: fails if NEITHER studentId nor groupId is populated", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "AssignmentSubmission" (
          id, "assignmentId", "studentId", "groupId", version, "isCurrentVersion",
          "fileKey", "fileUrl", "fileName", "fileSize", "mimeType", status, "submittedAt"
        ) VALUES (
          gen_random_uuid(), ${assignmentId}, NULL, NULL, 1, true,
          'key2', 'url2', 'doc.pdf', 1024, 'application/pdf', 'SUBMITTED', NOW()
        );
      `
    ).rejects.toThrow();
  });

  test("5. AssignmentSubmission accepts valid individual submission (studentId populated, groupId null)", async () => {
    const sub = await prisma.assignmentSubmission.create({
      data: {
        assignmentId,
        studentId: student1Id,
        groupId: null,
        version: 1,
        isCurrentVersion: true,
        fileKey: "storage/key1",
        fileUrl: "http://storage/key1",
        fileName: "submission_v1.pdf",
        fileSize: 2048,
        mimeType: "application/pdf",
        status: "SUBMITTED",
      },
    });
    expect(sub.id).toBeDefined();
    expect(sub.studentId).toBe(student1Id);
    expect(sub.groupId).toBeNull();
  });

  test("6. Partial unique index prevents multiple current versions for the same student", async () => {
    await expect(
      prisma.assignmentSubmission.create({
        data: {
          assignmentId,
          studentId: student1Id,
          groupId: null,
          version: 2,
          isCurrentVersion: true, // Violates idx_current_individual_submission!
          fileKey: "storage/key2",
          fileUrl: "http://storage/key2",
          fileName: "submission_v2.pdf",
          fileSize: 4096,
          mimeType: "application/pdf",
          status: "SUBMITTED",
        },
      })
    ).rejects.toThrow();
  });

  test("7. Positive file size check constraint fails if fileSize is zero or negative", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "AssignmentSubmission" (
          id, "assignmentId", "studentId", "groupId", version, "isCurrentVersion",
          "fileKey", "fileUrl", "fileName", "fileSize", "mimeType", status, "submittedAt"
        ) VALUES (
          gen_random_uuid(), ${assignmentId}, ${student1Id}, NULL, 3, false,
          'key3', 'url3', 'doc.pdf', 0, 'application/pdf', 'SUBMITTED', NOW()
        );
      `
    ).rejects.toThrow();
  });
});
