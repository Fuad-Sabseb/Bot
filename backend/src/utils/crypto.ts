import crypto from "crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Encrypt token payload using AES-256-GCM with unique 12-byte IV and AAD binding.
 * Serialized format: v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptPayload(payload: Record<string, any>, aad: string): string {
  const iv = crypto.randomBytes(12);
  const rawKey = env.TOKEN_ENCRYPTION_KEY;
  const key = rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)
    ? Buffer.from(rawKey, "hex")
    : crypto.createHash("sha256").update(rawKey).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  cipher.setAAD(Buffer.from(aad, "utf8"));
  let ciphertext = cipher.update(JSON.stringify(payload), "utf8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `v1:${iv.toString("hex")}:${authTag}:${ciphertext}`;
}

export function decryptPayload<T = Record<string, any>>(encryptedStr: string, aad: string): T {
  const parts = encryptedStr.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("INVALID_ENCRYPTED_FORMAT");
  }

  const iv = Buffer.from(parts[1], "hex");
  const authTag = Buffer.from(parts[2], "hex");
  const ciphertext = parts[3];
  const rawKey = env.TOKEN_ENCRYPTION_KEY;
  const key = rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)
    ? Buffer.from(rawKey, "hex")
    : crypto.createHash("sha256").update(rawKey).digest();

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}
