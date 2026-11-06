import { GlobalRole, ClassRole, CourseRole } from "@prisma/client";

export interface UserRoleContext {
  userId: string;
  campusId?: string | null;
  email?: string | null;
  fullName: string;
  isActive: boolean;
  globalRoles: GlobalRole[];
  classRoles: { classId: string; role: ClassRole }[];
  courseRoles: { courseOfferingId: string; role: CourseRole }[];
}

declare global {
  namespace Express {
    interface Request {
      user?: UserRoleContext;
      sessionId?: string;
    }
  }
}
