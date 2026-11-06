import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenPayload {
  userId: string;
  campusId?: string | null;
  sessionId: string;
}

export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: "15m",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      throw new Error("TOKEN_EXPIRED");
    }
    throw new Error("INVALID_TOKEN");
  }
}
