/**
 * Neon Realtime Service
 * Manages live query sealing and realtime configurations using @neon/realtime
 */

export interface RealtimeConfig {
  configured: boolean;
  realtimeUrl?: string;
  database: string;
}

export class RealtimeService {
  private static realtimeInstance: any = null;
  private static realtimeModule: any = null;

  private static async getRealtimeModule() {
    if (!this.realtimeModule) {
      // Load @neon/realtime/server dynamically to support CommonJS runtime
      const dynamicImport = new Function("specifier", "return import(specifier)");
      this.realtimeModule = await dynamicImport("@neon/realtime/server");
    }
    return this.realtimeModule;
  }

  private static async getInstance() {
    if (!process.env.NEON_REALTIME_SECRET) {
      throw new Error("NEON_REALTIME_SECRET is not configured");
    }

    if (!this.realtimeInstance) {
      const { createRealtime } = await this.getRealtimeModule();
      this.realtimeInstance = createRealtime({
        secret: process.env.NEON_REALTIME_SECRET,
        db: "neondb",
      });
    }

    return this.realtimeInstance;
  }

  /**
   * Check if Neon Realtime is configured with secret and URL.
   */
  static isConfigured(): boolean {
    return Boolean(process.env.NEON_REALTIME_SECRET && process.env.NEON_REALTIME_URL);
  }

  /**
   * Get public realtime configuration for frontend clients.
   */
  static getConfig(): RealtimeConfig {
    return {
      configured: this.isConfigured(),
      realtimeUrl: process.env.NEON_REALTIME_URL,
      database: "neondb",
    };
  }

  /**
   * Seal a parameterized SQL query for live client subscriptions.
   */
  static async sealQuery(sqlText: string, params: any[] = []): Promise<any> {
    const { rawSql } = await this.getRealtimeModule();
    const instance = await this.getInstance();

    const query = rawSql(sqlText, params);
    const sealed = await instance.seal({ query });
    return sealed;
  }

  /**
   * Pre-configured sealed live query for announcements.
   */
  static async sealAnnouncementsQuery(limit = 10): Promise<any> {
    const sql = `SELECT id, title, content, priority, "createdAt" FROM "Announcement" ORDER BY "createdAt" DESC LIMIT $1`;
    return this.sealQuery(sql, [limit]);
  }

  /**
   * Pre-configured sealed live query for course offering activity.
   */
  static async sealCourseActivityQuery(courseOfferingId: string): Promise<any> {
    const sql = `SELECT id, "courseOfferingId", title, category, "createdAt" FROM "LearningMaterial" WHERE "courseOfferingId" = $1 ORDER BY "createdAt" DESC LIMIT 20`;
    return this.sealQuery(sql, [courseOfferingId]);
  }
}
