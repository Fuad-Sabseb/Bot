import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { AuthService } from "../src/modules/auth/auth.service";

const app = createApp();

describe("Authentication & Token Rotation Security", () => {
  const testCampusId = "RU0018/17"; // An unused ID in registry
  let registeredRefreshToken: string;
  let testSessionId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Ensure testCampusId is reset to unused in CampusIdRegistry
    await prisma.campusIdRegistry.upsert({
      where: { campusId: testCampusId },
      update: { isUsed: false, usedByUserId: null },
      create: { campusId: testCampusId, isUsed: false },
    });

    // Clean any prior user with this ID
    const existing = await prisma.user.findUnique({ where: { campusId: testCampusId } });
    if (existing) {
      await prisma.user.delete({ where: { id: existing.id } });
    }
  });

  test("1. Registration fails for invalid Campus ID not in registry", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      campusId: "INVALID_ID_9999",
      fullName: "Fake Student",
      password: "password123",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_CAMPUS_ID");
  });

  test("2. Registration succeeds with valid unused Campus ID", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      campusId: testCampusId,
      fullName: "Jane Doe",
      email: "jane.doe@university.edu",
      password: "securePassword123!",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.campusId).toBe(testCampusId);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();

    registeredRefreshToken = res.body.data.tokens.refreshToken;
    testUserId = res.body.data.user.id;

    // Verify Campus ID is now marked isUsed = true in DB
    const registryEntry = await prisma.campusIdRegistry.findUnique({ where: { campusId: testCampusId } });
    expect(registryEntry?.isUsed).toBe(true);
    expect(registryEntry?.usedByUserId).toBe(testUserId);
  });

  test("3. Registration fails if Campus ID has already been claimed", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      campusId: testCampusId,
      fullName: "Duplicate Attempter",
      password: "password123",
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CAMPUS_ID_ALREADY_USED");
  });

  test("4. Login succeeds with valid campus ID and password", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: testCampusId,
      password: "securePassword123!",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.campusId).toBe(testCampusId);
    expect(res.body.data.tokens.accessToken).toBeDefined();
  });

  test("5. Login fails with incorrect password", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: testCampusId,
      password: "wrongPassword!",
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("6. Atomic Refresh Token Rotation issues new token pair and revokes old token", async () => {
    const res = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: registeredRefreshToken,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.refreshToken).not.toBe(registeredRefreshToken);

    const rotatedRefreshToken = res.body.data.refreshToken;

    // 7. Concurrent Refresh Request within 10-Second Grace Window:
    // Submitting the PREVIOUSLY rotated token within grace window must return the EXACT SAME token pair
    const concurrentRes = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: registeredRefreshToken,
    });

    expect(concurrentRes.status).toBe(200);
    expect(concurrentRes.body.data.refreshToken).toBe(rotatedRefreshToken);
  });

  test("8. Token Replay Attack after Grace Window revokes entire token family and terminates session", async () => {
    // Manually expire the grace window on the session in DB
    const tokenRecord = await prisma.refreshToken.findFirst({
      where: { isRevoked: true },
      include: { session: true },
    });
    expect(tokenRecord).not.toBeNull();

    await prisma.session.update({
      where: { id: tokenRecord!.sessionId },
      data: {
        rotationGraceUntil: new Date(Date.now() - 5000), // Expired 5 seconds ago!
      },
    });

    // Attempt to replay the old revoked refresh token after grace expiry
    const replayRes = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: registeredRefreshToken,
    });

    expect(replayRes.status).toBe(403);
    expect(replayRes.body.error.code).toBe("REPLAY_ATTACK_DETECTED");

    // Verify that the whole family and session have been revoked
    const session = await prisma.session.findUnique({ where: { id: tokenRecord!.sessionId } });
    expect(session?.isRevoked).toBe(true);

    const unrevokedTokens = await prisma.refreshToken.count({
      where: { familyId: tokenRecord!.familyId, isRevoked: false },
    });
    expect(unrevokedTokens).toBe(0);
  });
});
