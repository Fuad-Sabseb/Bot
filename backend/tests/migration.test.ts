import { prisma } from "../src/database/prisma";
import { runLegacyMigration } from "../scripts/migrate-legacy";
import fs from "fs";
import path from "path";

describe("Legacy Data Migration & Idempotency", () => {
  beforeAll(async () => {
    // Reset Feedback and CampusIdRegistry for test isolation
    await prisma.feedback.deleteMany({});
    await prisma.campusIdRegistry.deleteMany({});
  });

  test("1. Migration imports exactly 97 unique campus IDs and 34 used IDs", async () => {
    const report = await runLegacyMigration();

    expect(report.status).toBe("SUCCESS");
    expect(report.campusIdRegistry.uniqueImported).toBe(97);
    expect(report.campusIdRegistry.usedCount).toBe(34);
    expect(report.campusIdRegistry.unusedCount).toBe(63);
    expect(report.campusIdRegistry.duplicatesSkipped).toBe(2);
    expect(report.feedbacks.imported).toBe(5);

    // Verify database counts directly
    const dbTotal = await prisma.campusIdRegistry.count();
    const dbUsed = await prisma.campusIdRegistry.count({ where: { isUsed: true } });
    const dbUnused = await prisma.campusIdRegistry.count({ where: { isUsed: false } });
    const dbFeedback = await prisma.feedback.count();

    expect(dbTotal).toBe(97);
    expect(dbUsed).toBe(34);
    expect(dbUnused).toBe(63);
    expect(dbFeedback).toBe(5);
  });

  test("2. Re-running migration is completely idempotent (no duplicates, no errors)", async () => {
    const secondReport = await runLegacyMigration();

    expect(secondReport.status).toBe("SUCCESS");

    const dbTotal = await prisma.campusIdRegistry.count();
    const dbFeedback = await prisma.feedback.count();

    expect(dbTotal).toBe(97);
    expect(dbFeedback).toBe(5);
  });

  test("3. Exact matching verification: Substrings do not match registry", async () => {
    const matchSubstring1 = await prisma.campusIdRegistry.findUnique({ where: { campusId: "008" } });
    const matchSubstring2 = await prisma.campusIdRegistry.findUnique({ where: { campusId: "RU" } });
    const matchExact = await prisma.campusIdRegistry.findUnique({ where: { campusId: "RU0008/17" } });

    expect(matchSubstring1).toBeNull();
    expect(matchSubstring2).toBeNull();
    expect(matchExact).not.toBeNull();
    expect(matchExact?.campusId).toBe("RU0008/17");
  });

  test("4. Migration report JSON file exists and contains valid SHA-256 hashes", () => {
    const reportPath = path.resolve(process.cwd(), "backend", "migration-report.json");
    expect(fs.existsSync(reportPath)).toBe(true);

    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    expect(report.sourceFiles.length).toBe(4);
    report.sourceFiles.forEach((file: any) => {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
