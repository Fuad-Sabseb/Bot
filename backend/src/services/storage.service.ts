import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface StoredFileMeta {
  fileKey: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  fileSha256: string;
  filePath: string;
}

export class StorageService {
  private static basePath = path.resolve(process.cwd(), "storage");

  /**
   * Save an uploaded buffer or stream to a persistent local path with a sanitized, collision-free key.
   */
  static saveFile(
    fileBuffer: Buffer,
    subFolder: "assignments/individual" | "assignments/group" | "attachments" | "materials" | "uploads",
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

    fs.writeFileSync(filePath, fileBuffer);

    const fileSha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    return {
      fileKey,
      originalName: safeBaseName,
      fileSize: fileBuffer.length,
      mimeType,
      fileSha256,
      filePath,
    };
  }

  /**
   * Resolve absolute path for a stored fileKey and verify it remains within storage root.
   */
  static getFilePath(fileKey: string): string {
    const normalized = path.normalize(fileKey).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.join(this.basePath, normalized);

    if (!fullPath.startsWith(this.basePath)) {
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
}
