import { prisma } from "../../database/prisma";
import {
  hashPassword,
  verifyPassword,
  generateRandomToken,
  hashToken,
  encryptPayload,
  decryptPayload,
} from "../../utils/crypto";
import { generateAccessToken } from "../../utils/jwt";
import crypto from "crypto";

export interface RegisterInput {
  campusId: string;
  fullName: string;
  email?: string;
  password?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface LoginInput {
  identifier: string; // campusId or email
  password?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export class AuthService {
  /**
   * Register a new student using an authorized Campus ID from CampusIdRegistry.
   */
  static async registerStudent(input: RegisterInput): Promise<{ user: any; tokens: AuthTokens }> {
    const cleanId = input.campusId.trim();

    return await prisma.$transaction(async (tx) => {
      // 1. Exact match check in CampusIdRegistry
      const registryEntry = await tx.campusIdRegistry.findUnique({
        where: { campusId: cleanId },
      });

      if (!registryEntry) {
        const error: any = new Error("Invalid Campus ID. Your ID was not found in the official university roster.");
        error.statusCode = 400;
        error.code = "INVALID_CAMPUS_ID";
        throw error;
      }

      if (registryEntry.isUsed) {
        const error: any = new Error("This Campus ID has already been registered.");
        error.statusCode = 409;
        error.code = "CAMPUS_ID_ALREADY_USED";
        throw error;
      }

      // Check unique email if provided
      if (input.email) {
        const existingEmail = await tx.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
        if (existingEmail) {
          const error: any = new Error("Email is already in use by another account.");
          error.statusCode = 409;
          error.code = "EMAIL_ALREADY_USED";
          throw error;
        }
      }

      // 2. Hash password if provided
      const passwordHash = input.password ? await hashPassword(input.password) : null;

      // 3. Create User record
      const user = await tx.user.create({
        data: {
          campusId: cleanId,
          fullName: input.fullName.trim(),
          email: input.email ? input.email.trim().toLowerCase() : null,
          passwordHash,
          isActive: true,
          isVerified: true,
          globalRoles: {
            create: { role: "USER" },
          },
        },
      });

      // 4. Update CampusIdRegistry to used
      await tx.campusIdRegistry.update({
        where: { campusId: cleanId },
        data: {
          isUsed: true,
          usedByUserId: user.id,
        },
      });

      // 5. Create Session & Token Family
      const session = await tx.session.create({
        data: {
          userId: user.id,
          userAgent: input.userAgent || "Unknown",
          ipAddress: input.ipAddress || "Unknown",
        },
      });

      const familyId = crypto.randomUUID();
      const rawRefreshToken = generateRandomToken(48);
      const tokenHash = hashToken(rawRefreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await tx.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash,
          familyId,
          expiresAt,
        },
      });

      const accessToken = generateAccessToken({
        userId: user.id,
        campusId: user.campusId,
        sessionId: session.id,
      });

      return {
        user: {
          id: user.id,
          campusId: user.campusId,
          fullName: user.fullName,
          email: user.email,
        },
        tokens: {
          accessToken,
          refreshToken: rawRefreshToken,
          expiresIn: "15m",
        },
      };
    });
  }

  /**
   * Authenticate with password or Telegram verification.
   */
  static async login(input: LoginInput): Promise<{ user: any; tokens: AuthTokens }> {
    const identifier = input.identifier.trim();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ campusId: identifier }, { email: identifier.toLowerCase() }],
        isDeleted: false,
      },
      include: {
        globalRoles: true,
      },
    });

    if (!user) {
      const error: any = new Error("Invalid credentials.");
      error.statusCode = 401;
      error.code = "INVALID_CREDENTIALS";
      throw error;
    }

    if (!user.isActive) {
      const error: any = new Error("Your account has been suspended.");
      error.statusCode = 403;
      error.code = "USER_INACTIVE";
      throw error;
    }

    if (input.password) {
      if (!user.passwordHash) {
        const error: any = new Error("Account has no password configured. Please authenticate via Telegram.");
        error.statusCode = 400;
        error.code = "NO_PASSWORD_SET";
        throw error;
      }

      const isValid = await verifyPassword(input.password, user.passwordHash);
      if (!isValid) {
        const error: any = new Error("Invalid credentials.");
        error.statusCode = 401;
        error.code = "INVALID_CREDENTIALS";
        throw error;
      }
    }

    // Create session & refresh token family
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        userAgent: input.userAgent || "Unknown",
        ipAddress: input.ipAddress || "Unknown",
      },
    });

    const familyId = crypto.randomUUID();
    const rawRefreshToken = generateRandomToken(48);
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash,
        familyId,
        expiresAt,
      },
    });

    const accessToken = generateAccessToken({
      userId: user.id,
      campusId: user.campusId,
      sessionId: session.id,
    });

    return {
      user: {
        id: user.id,
        campusId: user.campusId,
        fullName: user.fullName,
        email: user.email,
        roles: user.globalRoles.map((r) => r.role),
      },
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: "15m",
      },
    };
  }

  /**
   * Atomic Refresh Token Rotation with 10-Second Concurrency Grace Window.
   */
  static async refreshTokens(rawRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(rawRefreshToken);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Locate token by hash
      const tokenRecord = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { session: true },
      });

      if (!tokenRecord) {
        const error: any = new Error("Invalid refresh token.");
        error.statusCode = 401;
        error.code = "INVALID_REFRESH_TOKEN";
        throw error;
      }

      const session = tokenRecord.session;

      // 2. Lock Session row for pessimistic concurrency serialization
      const lockedSession = await tx.$queryRaw<any[]>`
        SELECT * FROM "Session" WHERE id = ${session.id} FOR UPDATE
      `.then((res) => res[0]);

      if (!lockedSession || lockedSession.isRevoked) {
        const error: any = new Error("Session has been revoked.");
        error.statusCode = 401;
        error.code = "SESSION_REVOKED";
        throw error;
      }

      const now = new Date();

      // 3. Handle Already-Revoked Token (Concurrent Request vs Replay Attack)
      if (tokenRecord.isRevoked) {
        // Check if token matches the most recently rotated token AND falls within grace window
        const isRecentRotation = lockedSession.lastRotatedTokenHash === tokenHash;
        const isWithinGrace =
          lockedSession.rotationGraceUntil && now <= new Date(lockedSession.rotationGraceUntil);

        if (isRecentRotation && isWithinGrace && lockedSession.rotationCiphertext) {
          // Decrypt the cached replacement token pair
          const cachedTokens = decryptPayload<AuthTokens>(
            lockedSession.rotationCiphertext,
            lockedSession.id
          );
          return { success: true, tokens: cachedTokens };
        }

        // OUTSIDE GRACE WINDOW -> Mark breach to persist revocation
        return {
          isReplayBreach: true,
          familyId: tokenRecord.familyId,
          sessionId: session.id,
        };
      }

      // 4. Check expiration
      if (now > tokenRecord.expiresAt) {
        const error: any = new Error("Refresh token expired. Please login again.");
        error.statusCode = 401;
        error.code = "REFRESH_TOKEN_EXPIRED";
        throw error;
      }

      // 5. Valid Unrevoked Token -> Rotate!
      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { isRevoked: true },
      });

      const newRawRefreshToken = generateRandomToken(48);
      const newTokenHash = hashToken(newRawRefreshToken);
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await tx.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: newTokenHash,
          familyId: tokenRecord.familyId,
          expiresAt: newExpiresAt,
        },
      });

      const user = await tx.user.findUnique({ where: { id: session.userId } });
      if (!user || !user.isActive || user.isDeleted) {
        throw new Error("USER_INACTIVE");
      }

      const newAccessToken = generateAccessToken({
        userId: user.id,
        campusId: user.campusId,
        sessionId: session.id,
      });

      const tokenPayload: AuthTokens = {
        accessToken: newAccessToken,
        refreshToken: newRawRefreshToken,
        expiresIn: "15m",
      };

      // 6. Encrypt payload and save in grace cache
      const encryptedPayload = encryptPayload(tokenPayload, session.id);
      const graceUntil = new Date(Date.now() + 10 * 1000); // 10 seconds grace window

      await tx.session.update({
        where: { id: session.id },
        data: {
          lastRotatedTokenHash: tokenHash,
          rotationCiphertext: encryptedPayload,
          rotationGraceUntil: graceUntil,
          lastActiveAt: now,
        },
      });

      return { success: true, tokens: tokenPayload };
    });

    if ("isReplayBreach" in result && result.isReplayBreach) {
      console.warn(`🚨 REPLAY ATTACK DETECTED for familyId=${result.familyId}. Revoking entire token family.`);
      await prisma.$transaction([
        prisma.refreshToken.updateMany({
          where: { familyId: result.familyId },
          data: { isRevoked: true },
        }),
        prisma.session.update({
          where: { id: result.sessionId },
          data: { isRevoked: true },
        }),
      ]);

      const error: any = new Error("Security breach detected: Replay of revoked refresh token. All active sessions terminated.");
      error.statusCode = 403;
      error.code = "REPLAY_ATTACK_DETECTED";
      throw error;
    }

    return (result as any).tokens;
  }

  /**
   * Revoke a single session.
   */
  static async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) return false;

    await prisma.$transaction([
      prisma.session.update({
        where: { id: sessionId },
        data: { isRevoked: true },
      }),
      prisma.refreshToken.updateMany({
        where: { sessionId },
        data: { isRevoked: true },
      }),
    ]);

    return true;
  }

  /**
   * List active sessions for user.
   */
  static async listSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId, isRevoked: false },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        lastActiveAt: true,
        createdAt: true,
      },
      orderBy: { lastActiveAt: "desc" },
    });
  }
}
