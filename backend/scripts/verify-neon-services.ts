import dotenv from "dotenv";
dotenv.config();

import { prisma } from "../src/database/prisma";
import { StorageService } from "../src/services/storage.service";
import { NeonAIGatewayProvider, getAIProvider } from "../src/modules/ai/ai.provider";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { AdminService } from "../src/modules/admin/admin.service";
import { createApp } from "../src/app";
import { generateAccessToken } from "../src/utils/jwt";
import http from "http";

async function runEndToEndVerification() {
  console.log("=================================================");
  console.log("   NEON FULL-STACK INTEGRATION VERIFICATION");
  console.log("=================================================\n");

  let allPassed = true;

  // -----------------------------------------------------------------
  // 1. NEON POSTGRES DATABASE TEST
  // -----------------------------------------------------------------
  console.log("👉 1. Testing Neon Postgres Database...");
  try {
    const dbInfo: any = await prisma.$queryRaw`SELECT version(), current_database(), current_user`;
    console.log("   ✅ Connected to database:", dbInfo[0].current_database);
    console.log("   ✅ Database user:", dbInfo[0].current_user);
    console.log("   ✅ PostgreSQL version:", dbInfo[0].version.split(",")[0]);

    // Test pgvector extension (cast to text for Prisma raw query deserialization)
    const vectorTest: any = await prisma.$queryRaw`SELECT ('[1,2,3]'::vector)::text as test_vec`;
    console.log("   ✅ pgvector extension active:", vectorTest[0].test_vec);

    // Verify Prisma schema accessibility
    const userCount = await prisma.user.count();
    console.log(`   ✅ Prisma schema query executed successfully (users count: ${userCount})`);
  } catch (err: any) {
    console.error("   ❌ Neon Postgres test failed:", err.message);
    allPassed = false;
  }

  // -----------------------------------------------------------------
  // 2. NEON OBJECT STORAGE TEST
  // -----------------------------------------------------------------
  console.log("\n👉 2. Testing Neon Object Storage (S3)...");
  try {
    const testKey = `test/neon-verify-${Date.now()}.txt`;
    const testContent = Buffer.from(`Neon Object Storage Verification - ${new Date().toISOString()}`);

    console.log("   Uploading test file to S3:", testKey);
    await StorageService.uploadToS3(testKey, testContent, "text/plain");
    console.log("   ✅ Upload to bucket 'assets' succeeded!");

    console.log("   Downloading test file from S3...");
    const downloaded = await StorageService.downloadFromS3(testKey);
    if (downloaded.toString() === testContent.toString()) {
      console.log("   ✅ Download succeeded! Content integrity verified.");
    } else {
      throw new Error("Content mismatch on download");
    }

    const presignedUrl = await StorageService.getPresignedUrl(testKey, 60);
    console.log("   ✅ Presigned URL generated:", presignedUrl.slice(0, 60) + "...");

    // Clean up
    StorageService.deleteFile(testKey);
    console.log("   ✅ Object cleanup dispatched.");
  } catch (err: any) {
    console.error("   ❌ Neon Object Storage test failed:", err.message);
    allPassed = false;
  }

  // -----------------------------------------------------------------
  // 3. NEON AI GATEWAY TEST
  // -----------------------------------------------------------------
  console.log("\n👉 3. Testing Neon AI Gateway...");
  try {
    const gateway = new NeonAIGatewayProvider();
    const models = await gateway.listAvailableModels();
    console.log(`   ✅ Successfully queried AI Gateway /v1/models! Found ${models.length} models in branch catalog.`);
    console.log("   Sample models:", models.slice(0, 4).join(", "));

    const provider = getAIProvider();
    console.log("   Active AI Provider name:", provider.name);

    const completion = await provider.generateCompletion("Explain vector similarity search in one sentence.");
    console.log(`   ✅ AI Completion output received (model: ${completion.model}):`);
    console.log(`   "${completion.content.trim().slice(0, 100)}..."`);

    const embedding = await provider.generateEmbedding("University course material");
    console.log(`   ✅ Embedding vector generated with dimension: ${embedding.length}`);
  } catch (err: any) {
    console.error("   ❌ Neon AI Gateway test failed:", err.message);
    allPassed = false;
  }

  // -----------------------------------------------------------------
  // 4. NEON REALTIME TEST
  // -----------------------------------------------------------------
  console.log("\n👉 4. Testing Neon Realtime...");
  try {
    console.log("   Realtime URL:", RealtimeService.getConfig().realtimeUrl);
    const sealed = await RealtimeService.sealAnnouncementsQuery(5);
    console.log("   ✅ Live query sealed successfully using NEON_REALTIME_SECRET!");
    console.log("   Sealed token length:", typeof sealed === "string" ? sealed.length : JSON.stringify(sealed).length);
  } catch (err: any) {
    console.error("   ❌ Neon Realtime test failed:", err.message);
    allPassed = false;
  }

  // -----------------------------------------------------------------
  // 5. APP HTTP SERVER & SYSTEM HEALTH TEST
  // -----------------------------------------------------------------
  console.log("\n👉 5. Testing App Server & HTTP Routes...");
  let server: http.Server | null = null;
  try {
    const app = createApp();
    const port = 3456;

    await new Promise<void>((resolve, reject) => {
      server = app.listen(port, () => {
        console.log(`   ✅ Express server started on port ${port}`);
        resolve();
      });
      server.on("error", reject);
    });

    // Test /health
    const healthRes = await fetch(`http://localhost:${port}/health`);
    const healthJson: any = await healthRes.json();
    console.log("   ✅ GET /health status:", healthRes.status, `(status: ${healthJson.status})`);

    // Test /api/v1/realtime/config
    const rtConfigRes = await fetch(`http://localhost:${port}/api/v1/realtime/config`);
    const rtConfigJson: any = await rtConfigRes.json();
    console.log("   ✅ GET /api/v1/realtime/config status:", rtConfigRes.status, `(configured: ${rtConfigJson.data?.configured})`);

    // Test AdminService.getSystemHealth directly
    const directHealth = await AdminService.getSystemHealth();
    console.log("   ✅ System Health Diagnostics retrieved directly from AdminService:");
    console.log("      - Overall status:", directHealth.status);
    console.log("      - Postgres status:", directHealth.neon.postgres.status, `(latency: ${directHealth.neon.postgres.latencyMs}ms)`);
    console.log("      - Object Storage:", directHealth.neon.objectStorage.configured ? `Configured (bucket: ${directHealth.neon.objectStorage.bucket})` : "Not configured");
    console.log("      - AI Gateway:", directHealth.neon.aiGateway.configured ? `Configured (${directHealth.neon.aiGateway.provider})` : "Not configured");
    console.log("      - Realtime:", directHealth.neon.realtime.configured ? `Configured (${directHealth.neon.realtime.endpoint})` : "Not configured");

    // Retrieve or create an admin user
    let adminUser = await prisma.user.findFirst({
      where: { globalRoles: { some: { role: "ADMIN" } } },
      include: { globalRoles: true },
    });

    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          campusId: "neon_admin_test",
          email: "neon_admin@campus.edu",
          fullName: "Neon Admin",
          isVerified: true,
          isActive: true,
          globalRoles: {
            create: { role: "ADMIN" },
          },
        },
        include: { globalRoles: true },
      });
    }

    const session = await prisma.session.create({
      data: {
        userId: adminUser.id,
        userAgent: "Neon E2E Test Suite",
      },
    });

    const adminToken = generateAccessToken({
      userId: adminUser.id,
      campusId: adminUser.campusId,
      sessionId: session.id,
    });

    const adminHealthRes = await fetch(`http://localhost:${port}/api/v1/admin/system/health`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const adminHealthJson: any = await adminHealthRes.json();
    console.log("   ✅ GET /api/v1/admin/system/health (Authenticated):", adminHealthRes.status);
    console.log("      - Response overall status:", adminHealthJson.data?.status);

    // Clean up temporary session
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
  } catch (err: any) {
    console.error("   ❌ Server HTTP test failed:", err.message);
    allPassed = false;
  } finally {
    if (server) {
      (server as http.Server).close();
      console.log("   ✅ Test server closed gracefully.");
    }
  }

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 ALL NEON SERVICES VERIFIED END-TO-END!");
  } else {
    console.error("⚠️ SOME SERVICES FAILED VERIFICATION");
  }
  console.log("=================================================");

  await prisma.$disconnect();
  process.exit(allPassed ? 0 : 1);
}

runEndToEndVerification().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
