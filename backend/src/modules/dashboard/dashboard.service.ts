import { prisma } from "../../database/prisma";
import { UserRoleContext } from "../../types/auth";

export class DashboardService {
  static async getOverview(userCtx: UserRoleContext) {
    const { userId, globalRoles, classRoles, courseRoles } = userCtx;

    // 1. ADMIN DASHBOARD
    if (globalRoles.includes("ADMIN")) {
      const [
        totalUsers,
        verifiedStudents,
        totalClasses,
        totalCourses,
        totalOfferings,
        openFeedbacks,
        currentYear,
        currentSemester,
      ] = await Promise.all([
        prisma.user.count({ where: { isDeleted: false } }),
        prisma.user.count({ where: { isVerified: true, isDeleted: false } }),
        prisma.class.count({ where: { isArchived: false } }),
        prisma.course.count({ where: { isArchived: false } }),
        prisma.courseOffering.count({ where: { isArchived: false } }),
        prisma.feedback.count({ where: { status: "OPEN" } }),
        prisma.academicYear.findFirst({ where: { isCurrent: true } }),
        prisma.semester.findFirst({ where: { isCurrent: true }, include: { academicYear: true } }),
      ]);

      return {
        roleScope: "ADMIN",
        academicContext: {
          currentYear: currentYear?.name || "None active",
          currentSemester: currentSemester?.name || "None active",
        },
        metrics: {
          totalUsers,
          verifiedStudents,
          totalClasses,
          totalCourses,
          totalOfferings,
          openFeedbacks,
        },
      };
    }

    // 2. TEACHER DASHBOARD
    const isInstructor = courseRoles.some((cr) =>
      ["LEAD_INSTRUCTOR", "INSTRUCTOR", "TEACHING_ASSISTANT"].includes(cr.role)
    );

    if (isInstructor) {
      const taughtOfferings = await prisma.userCourseRole.findMany({
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
      });

      return {
        roleScope: "TEACHER",
        coursesCount: taughtOfferings.length,
        courses: taughtOfferings.map((to) => ({
          offeringId: to.courseOffering.id,
          courseCode: to.courseOffering.course.code,
          courseTitle: to.courseOffering.course.title,
          role: to.role,
          className: to.courseOffering.class.name,
          semester: to.courseOffering.semester.name,
          enrolledStudents: to.courseOffering._count.enrollments,
          assignmentsCount: to.courseOffering._count.assignments,
          materialsCount: to.courseOffering._count.materials,
        })),
      };
    }

    // 3. CLASS REPRESENTATIVE DASHBOARD
    const isClassRep = classRoles.some((cr) => cr.role === "CLASS_REP");

    if (isClassRep) {
      const repRoles = classRoles.filter((cr) => cr.role === "CLASS_REP");
      const classSummaries = await Promise.all(
        repRoles.map(async (r) => {
          const cls = await prisma.class.findUnique({
            where: { id: r.classId },
            include: {
              academicYear: true,
              _count: { select: { primaryStudents: true, offerings: true } },
            },
          });
          return {
            classId: cls?.id,
            className: cls?.name,
            classCode: cls?.code,
            academicYear: cls?.academicYear.name,
            classmatesCount: cls?._count.primaryStudents,
            offeringsCount: cls?._count.offerings,
          };
        })
      );

      return {
        roleScope: "CLASS_REP",
        classesManaged: classSummaries,
      };
    }

    // 4. STUDENT DASHBOARD (Default)
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        primaryClass: { include: { academicYear: true } },
        enrollments: {
          where: { status: "ACTIVE" },
          include: {
            courseOffering: {
              include: {
                course: true,
                semester: true,
                courseRoles: {
                  where: { role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR"] } },
                  include: { user: { select: { fullName: true } } },
                },
                _count: { select: { assignments: true, materials: true } },
              },
            },
          },
        },
      },
    });

    return {
      roleScope: "STUDENT",
      studentInfo: {
        fullName: userRecord?.fullName,
        campusId: userRecord?.campusId,
        className: userRecord?.primaryClass?.name || "Unassigned",
        academicYear: userRecord?.primaryClass?.academicYear.name || "N/A",
        isTelegramLinked: !!userRecord?.telegramChatId,
      },
      enrolledCourses: userRecord?.enrollments.map((e) => ({
        offeringId: e.courseOffering.id,
        courseCode: e.courseOffering.course.code,
        courseTitle: e.courseOffering.course.title,
        semester: e.courseOffering.semester.name,
        instructors: e.courseOffering.courseRoles.map((cr) => cr.user.fullName),
        assignmentsCount: e.courseOffering._count.assignments,
        materialsCount: e.courseOffering._count.materials,
      })),
    };
  }
}
