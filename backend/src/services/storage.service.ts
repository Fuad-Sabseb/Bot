import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StoredFileMeta {
  fileKey: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  fileSha256: string;
  filePath: string;
  storageProvider?: "local" | "s3";
}

export class StorageService {
  private static basePath = path.resolve(process.cwd(), "storage");
  private static bucketName = process.env.AWS_BUCKET || "assets";
  private static s3Client: S3Client | null = StorageService.initS3Client();

  private static initS3Client(): S3Client | null {
    if (process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_ACCESS_KEY_ID) {
      return new S3Client({
        endpoint: process.env.AWS_ENDPOINT_URL_S3,
        region: process.env.AWS_REGION || "us-east-2",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
        },
        forcePathStyle: true,
      });
    }
    return null;
  }

  /**
   * Check if Neon Object Storage (S3) is configured and active.
   */
  static isS3Configured(): boolean {
    return this.s3Client !== null;
  }

  /**
   * Upload buffer directly to Neon Object Storage.
   */
  static async uploadToS3(
    fileKey: string,
    fileBuffer: Buffer,
    mimeType?: string
  ): Promise<void> {
    if (!this.s3Client) {
      throw new Error("Neon Object Storage (S3) is not configured");
    }

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: mimeType || "application/octet-stream",
      })
    );
  }

  /**
   * Download object bytes from Neon Object Storage.
   */
  static async downloadFromS3(fileKey: string): Promise<Buffer> {
    if (!this.s3Client) {
      throw new Error("Neon Object Storage (S3) is not configured");
    }

    const res = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      })
    );

    if (!res.Body) {
      throw new Error("FILE_NOT_FOUND_IN_S3");
    }

    const byteArray = await res.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  /**
   * Generate a presigned download URL for direct browser access.
   */
  static async getPresignedUrl(fileKey: string, expiresIn = 3600): Promise<string> {
    if (!this.s3Client) {
      throw new Error("Neon Object Storage (S3) is not configured");
    }

    return getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      }),
      { expiresIn }
    );
  }

  /**
   * Save an uploaded buffer or stream to a persistent local path with a sanitized, collision-free key,
   * and synchronously/asynchronously mirror to Neon Object Storage if configured.
   */
  static saveFile(
    fileBuffer: Buffer,
    subFolder: "assignments/individual" | "assignments/group" | "attachments" | "materials" | "archive" | "uploads",
    originalName: string,
    mimeType: string
  ): StoredFileMeta {
    const targetDir = path.join(this.basePath, subFolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Sanitize original filename (remove path traversal attempts)
    const safeBaseName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniquePrefix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const fileKey = `${subFolder}/${uniquePrefix}_${safeBaseName}`;
    const filePath = path.join(this.basePath, fileKey);

    // Save locally
    fs.writeFileSync(filePath, fileBuffer);

    // Async sync to Neon Object Storage
    if (this.s3Client) {
      this.uploadToS3(fileKey, fileBuffer, mimeType).catch((err) => {
        console.warn(`⚠️ Failed to sync ${fileKey} to Neon Object Storage:`, err.message);
      });
    }

    const fileSha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    return {
      fileKey,
      originalName: safeBaseName,
      fileSize: fileBuffer.length,
      mimeType,
      fileSha256,
      filePath,
      storageProvider: this.s3Client ? "s3" : "local",
    };
  }

  /**
   * Resolve absolute path for a stored fileKey and verify it remains strictly within storage root.
   */
  static getFilePath(fileKey: string): string {
    if (!fileKey || typeof fileKey !== "string") {
      throw new Error("ACCESS_DENIED: Invalid file key");
    }

    const safeKey = fileKey.replace(/^\/+/, "");
    const fullPath = path.resolve(this.basePath, safeKey);
    const relative = path.relative(this.basePath, fullPath);

    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("ACCESS_DENIED: Path traversal detected");
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error("FILE_NOT_FOUND");
    }

    return fullPath;
  }

  /**
   * Stream a stored file to an HTTP response with safe content disposition.
   */
  static getFileStream(fileKey: string): fs.ReadStream {
    const filePath = this.getFilePath(fileKey);
    return fs.createReadStream(filePath);
  }

  /**
   * Safely delete a stored file from disk and Neon Object Storage.
   */
  static deleteFile(fileKey: string): boolean {
    let deleted = false;
    try {
      const filePath = this.getFilePath(fileKey);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted = true;
      }
    } catch (err: any) {
      console.warn(`⚠️ Failed to delete local file ${fileKey}:`, err.message);
    }

    // Also delete from Neon Object Storage if configured
    if (this.s3Client) {
      this.s3Client
        .send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: fileKey,
          })
        )
        .catch((err) => {
          console.warn(`⚠️ Failed to delete object ${fileKey} from Neon Object Storage:`, err.message);
        });
      deleted = true;
    }

    return deleted;
  }
}
