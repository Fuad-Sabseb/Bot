import { prisma } from "../../database/prisma";
import { CourseRole } from "@prisma/client";

export class AcademicService {
  // ==========================================
  // ACADEMIC YEARS & SEMESTERS
  // ==========================================

  static async createAcademicYear(data: {
    name: string;
    startDate: Date;
    endDate: Date;
    isCurrent?: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      if (data.isCurrent) {
        await tx.academicYear.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        });
      }

      return tx.academicYear.create({
        data: {
          name: data.name.trim(),
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          isCurrent: data.isCurrent || false,
        },
      });
    });
  }

  static async listAcademicYears() {
    return prisma.academicYear.findMany({
      include: {
        semesters: { orderBy: { semesterNumber: "asc" } },
        classes: { select: { id: true, name: true, code: true } },
      },
      orderBy: { startDate: "desc" },
    });
  }

  static async setCurrentAcademicYear(yearId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });

      return tx.academicYear.update({
        where: { id: yearId },
        data: { isCurrent: true },
      });
    });
  }

  static async createSemester(data: {
    academicYearId: string;
    semesterNumber: number;
    name: string;
    startDate: Date;
    endDate: Date;
    isCurrent?: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      if (data.isCurrent) {
        await tx.semester.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        });
      }

      return tx.semester.create({
        data: {
          academicYearId: data.academicYearId,
          semesterNumber: data.semesterNumber,
          name: data.name.trim(),
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          isCurrent: data.isCurrent || false,
        },
      });
    });
  }

  static async listSemesters(academicYearId?: string) {
    return prisma.semester.findMany({
      where: academicYearId ? { academicYearId } : undefined,
      include: { academicYear: true },
      orderBy: { startDate: "desc" },
    });
  }

  static async setCurrentSemester(semesterId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.semester.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });

      return tx.semester.update({
        where: { id: semesterId },
        data: { isCurrent: true },
      });
    });
  }

  // ==========================================
  // CLASSES
  // ==========================================

  static async createClass(data: {
    name: string;
    code: string;
    department: string;
    academicYearId: string;
  }) {
    return prisma.class.create({
      data: {
        name: data.name.trim(),
        code: data.code.trim().toUpperCase(),
        department: data.department.trim(),
        academicYearId: data.academicYearId,
      },
      include: { academicYear: true },
    });
  }

  static async listClasses(academicYearId?: string) {
    const classes = await prisma.class.findMany({
      where: {
        ...(academicYearId ? { academicYearId } : {}),
        isArchived: false,
      },
      include: {
        academicYear: true,
        _count: {
          select: { primaryStudents: true, offerings: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      department: c.department,
      academicYear: c.academicYear.name,
      studentCount: c._count.primaryStudents,
      offeringCount: c._count.offerings,
    }));
  }

  static async getClass(classId: string) {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        academicYear: true,
        primaryStudents: {
          where: { isDeleted: false },
          select: { id: true, fullName: true, campusId: true, email: true },
        },
        classRoles: {
          where: { role: "CLASS_REP" },
          include: { user: { select: { id: true, fullName: true, email: true } } },
        },
        offerings: {
          include: {
            course: true,
            semester: true,
          },
        },
      },
    });

    if (!cls) {
      const error: any = new Error("Class not found.");
      error.statusCode = 404;
      error.code = "CLASS_NOT_FOUND";
      throw error;
    }

    return cls;
  }

  static async assignStudentToClass(studentId: string, classId: string) {
    return prisma.$transaction(async (tx) => {
      const cls = await tx.class.findUnique({ where: { id: classId } });
      if (!cls) throw new Error("CLASS_NOT_FOUND");

      await tx.user.update({
        where: { id: studentId },
        data: { primaryClassId: classId },
      });

      // Also ensure STUDENT role is assigned in UserClassRole
      await tx.userClassRole.upsert({
        where: { userId_classId_role: { userId: studentId, classId, role: "STUDENT" } },
        update: {},
        create: { userId: studentId, classId, role: "STUDENT" },
      });

      return { success: true, message: "Student assigned to class cohort." };
    });
  }

  // ==========================================
  // COURSES
  // ==========================================

  static async createCourse(data: {
    code: string;
    title: string;
    description?: string;
    credits?: number;
  }) {
    return prisma.course.create({
      data: {
        code: data.code.trim().toUpperCase(),
        title: data.title.trim(),
        description: data.description?.trim(),
        credits: data.credits || 3,
      },
    });
  }

  static async listCourses(search?: string) {
    const where: any = { isArchived: false };
    if (search) {
      const s = search.trim();
      where.OR = [
        { code: { contains: s, mode: "insensitive" } },
        { title: { contains: s, mode: "insensitive" } },
      ];
    }
    return prisma.course.findMany({
      where,
      orderBy: { code: "asc" },
      include: {
        _count: { select: { offerings: true } },
      },
    });
  }

  // ==========================================
  // COURSE OFFERINGS
  // ==========================================

  static async createCourseOffering(data: {
    courseId: string;
    semesterId: string;
    classId: string;
    syllabus?: string;
  }) {
    return prisma.courseOffering.create({
      data: {
        courseId: data.courseId,
        semesterId: data.semesterId,
        classId: data.classId,
        syllabus: data.syllabus?.trim(),
      },
      include: {
        course: true,
        semester: true,
        class: true,
      },
    });
  }

  static async listCourseOfferings(query?: {
    semesterId?: string;
    classId?: string;
    courseId?: string;
  }) {
    return prisma.courseOffering.findMany({
      where: {
        ...query,
        isArchived: false,
      },
      include: {
        course: true,
        semester: true,
        class: true,
        courseRoles: {
          where: { role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR"] } },
          include: { user: { select: { id: true, fullName: true, email: true } } },
        },
        _count: { select: { enrollments: true, assignments: true, materials: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getCourseOffering(offeringId: string) {
    const offering = await prisma.courseOffering.findUnique({
      where: { id: offeringId },
      include: {
        course: true,
        semester: true,
        class: true,
        courseRoles: {
          include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
        },
        enrollments: {
          where: { status: "ACTIVE" },
          include: { user: { select: { id: true, fullName: true, campusId: true, email: true } } },
        },
        _count: { select: { assignments: true, materials: true, questions: true } },
      },
    });

    if (!offering) {
      const error: any = new Error("Course offering not found.");
      error.statusCode = 404;
      error.code = "OFFERING_NOT_FOUND";
      throw error;
    }

    return offering;
  }

  static async assignInstructor(offeringId: string, instructorId: string, role: CourseRole = "INSTRUCTOR") {
    return prisma.$transaction(async (tx) => {
      const offering = await tx.courseOffering.findUnique({ where: { id: offeringId } });
      if (!offering) throw new Error("OFFERING_NOT_FOUND");

      return tx.userCourseRole.upsert({
        where: { userId_courseOfferingId_role: { userId: instructorId, courseOfferingId: offeringId, role } },
        update: {},
        create: {
          userId: instructorId,
          courseOfferingId: offeringId,
          role,
        },
      });
    });
  }

  static async removeInstructor(offeringId: string, instructorId: string, role?: CourseRole) {
    return prisma.userCourseRole.deleteMany({
      where: {
        userId: instructorId,
        courseOfferingId: offeringId,
        ...(role ? { role } : {}),
      },
    });
  }

  // ==========================================
  // ENROLLMENTS
  // ==========================================

  static async enrollStudent(offeringId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const offering = await tx.courseOffering.findUnique({ where: { id: offeringId } });
      if (!offering) throw new Error("OFFERING_NOT_FOUND");

      const enrollment = await tx.enrollment.upsert({
        where: { userId_courseOfferingId: { userId, courseOfferingId: offeringId } },
        update: { status: "ACTIVE" },
        create: {
          userId,
          courseOfferingId: offeringId,
          status: "ACTIVE",
        },
      });

      // Also ensure STUDENT course role exists
      await tx.userCourseRole.upsert({
        where: { userId_courseOfferingId_role: { userId, courseOfferingId: offeringId, role: "STUDENT" } },
        update: {},
        create: { userId, courseOfferingId: offeringId, role: "STUDENT" },
      });

      return enrollment;
    });
  }

  static async batchEnrollClass(offeringId: string) {
    return prisma.$transaction(async (tx) => {
      const offering = await tx.courseOffering.findUnique({
        where: { id: offeringId },
        include: { class: { include: { primaryStudents: { where: { isDeleted: false, isActive: true } } } } },
      });

      if (!offering) throw new Error("OFFERING_NOT_FOUND");

      const students = offering.class.primaryStudents;
      let enrolledCount = 0;

      for (const student of students) {
        await tx.enrollment.upsert({
          where: { userId_courseOfferingId: { userId: student.id, courseOfferingId: offeringId } },
          update: { status: "ACTIVE" },
          create: {
            userId: student.id,
            courseOfferingId: offeringId,
            status: "ACTIVE",
          },
        });

        await tx.userCourseRole.upsert({
          where: { userId_courseOfferingId_role: { userId: student.id, courseOfferingId: offeringId, role: "STUDENT" } },
          update: {},
          create: { userId: student.id, courseOfferingId: offeringId, role: "STUDENT" },
        });

        enrolledCount++;
      }

      return {
        success: true,
        totalClassStudents: students.length,
        enrolledCount,
      };
    });
  }

  static async dropStudent(offeringId: string, userId: string) {
    return prisma.enrollment.update({
      where: { userId_courseOfferingId: { userId, courseOfferingId: offeringId } },
      data: { status: "DROPPED" },
    });
  }

  static async getMyCourses(userId: string) {
    const [enrolled, instructed] = await Promise.all([
      prisma.enrollment.findMany({
        where: { userId, status: "ACTIVE" },
        include: {
          courseOffering: {
            include: {
              course: true,
              semester: true,
              class: true,
              courseRoles: {
                where: { role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR"] } },
                include: { user: { select: { fullName: true } } },
              },
              _count: { select: { assignments: true, materials: true } },
            },
          },
        },
      }),
      prisma.userCourseRole.findMany({
        where: {
          userId,
          role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR", "TEACHING_ASSISTANT"] },
        },
        include: {
          courseOffering: {
            include: {
              course: true,
              semester: true,
              class: true,
              _count: { select: { enrollments: true, assignments: true, materials: true } },
            },
          },
        },
      }),
    ]);

    return {
      enrolled: enrolled.map((e) => ({
        offeringId: e.courseOffering.id,
        courseCode: e.courseOffering.course.code,
        courseTitle: e.courseOffering.course.title,
        semester: e.courseOffering.semester.name,
        className: e.courseOffering.class.name,
        instructors: e.courseOffering.courseRoles.map((cr) => cr.user.fullName),
        assignmentsCount: e.courseOffering._count.assignments,
        materialsCount: e.courseOffering._count.materials,
      })),
      instructed: instructed.map((i) => ({
        offeringId: i.courseOffering.id,
        courseCode: i.courseOffering.course.code,
        courseTitle: i.courseOffering.course.title,
        role: i.role,
        semester: i.courseOffering.semester.name,
        className: i.courseOffering.class.name,
        studentsCount: i.courseOffering._count.enrollments,
        assignmentsCount: i.courseOffering._count.assignments,
        materialsCount: i.courseOffering._count.materials,
      })),
    };
  }
}
