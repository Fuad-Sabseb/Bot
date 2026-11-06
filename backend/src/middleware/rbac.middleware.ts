import { Request, Response, NextFunction } from "express";
import { GlobalRole, ClassRole, CourseRole } from "@prisma/client";

export function requireGlobalRole(...allowedRoles: GlobalRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    const hasRole = req.user.globalRoles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You do not have the necessary global privileges for this action",
        },
      });
      return;
    }

    next();
  };
}

export function requireClassRole(
  getClassId: (req: Request) => string | undefined,
  ...allowedRoles: ClassRole[]
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    // Global ADMIN bypasses class scope checks
    if (req.user.globalRoles.includes("ADMIN")) {
      next();
      return;
    }

    const targetClassId = getClassId(req);
    if (!targetClassId) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_TARGET", message: "Target classId could not be resolved from request" },
      });
      return;
    }

    const matchingRole = req.user.classRoles.find(
      (cr) => cr.classId === targetClassId && allowedRoles.includes(cr.role)
    );

    if (!matchingRole) {
      res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN_CLASS_SCOPE",
          message: "You do not hold the required role within the specified class cohort",
        },
      });
      return;
    }

    next();
  };
}

export function requireCourseRole(
  getOfferingId: (req: Request) => string | undefined,
  ...allowedRoles: CourseRole[]
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    // Global ADMIN bypasses course scope checks
    if (req.user.globalRoles.includes("ADMIN")) {
      next();
      return;
    }

    const targetOfferingId = getOfferingId(req);
    if (!targetOfferingId) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_TARGET", message: "Target courseOfferingId could not be resolved from request" },
      });
      return;
    }

    const matchingRole = req.user.courseRoles.find(
      (cr) => cr.courseOfferingId === targetOfferingId && allowedRoles.includes(cr.role)
    );

    if (!matchingRole) {
      res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN_COURSE_SCOPE",
          message: "You do not hold the required role within the specified course offering",
        },
      });
      return;
    }

    next();
  };
}
