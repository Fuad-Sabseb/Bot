import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { prisma } from "../database/prisma";
import { UserRoleContext } from "../types/auth";

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or malformed Authorization header",
        },
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err: any) {
      if (err.message === "TOKEN_EXPIRED") {
        res.status(401).json({
          success: false,
          error: {
            code: "TOKEN_EXPIRED",
            message: "Access token has expired. Please refresh your session.",
          },
        });
        return;
      }
      res.status(401).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Access token is invalid",
        },
      });
      return;
    }

    // Verify Session is active
    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: {
        user: {
          include: {
            globalRoles: true,
            classRoles: true,
            courseRoles: true,
          },
        },
      },
    });

    if (!session || session.isRevoked) {
      res.status(401).json({
        success: false,
        error: {
          code: "SESSION_REVOKED",
          message: "Session has been revoked or expired",
        },
      });
      return;
    }

    if (!session.user.isActive || session.user.isDeleted) {
      res.status(403).json({
        success: false,
        error: {
          code: "USER_DEACTIVATED",
          message: "User account is suspended or deactivated",
        },
      });
      return;
    }

    const roleContext: UserRoleContext = {
      userId: session.user.id,
      campusId: session.user.campusId,
      email: session.user.email,
      fullName: session.user.fullName,
      isActive: session.user.isActive,
      globalRoles: session.user.globalRoles.map((r) => r.role),
      classRoles: session.user.classRoles.map((r) => ({ classId: r.classId, role: r.role })),
      courseRoles: session.user.courseRoles.map((r) => ({ courseOfferingId: r.courseOfferingId, role: r.role })),
    };

    req.user = roleContext;
    req.sessionId = session.id;

    next();
  } catch (error) {
    next(error);
  }
}
