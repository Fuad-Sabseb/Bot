import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // If request uses Bearer token authorization, CSRF check is bypassed (standard OAuth2 / stateless design)
  if (req.headers.authorization?.startsWith("Bearer ")) {
    return next();
  }

  // Ensure CSRF token cookie is present for browser clients
  let csrfCookie = req.cookies?.["csrf-token"];
  if (!csrfCookie) {
    csrfCookie = crypto.randomBytes(24).toString("hex");
    res.cookie("csrf-token", csrfCookie, {
      httpOnly: false, // Must be readable by client JS to send in x-csrf-token header
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  // Safe HTTP methods do not mutate state
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // If no ambient session cookies exist (e.g. login, register, unauthenticated requests),
  // there are no ambient credentials to exploit via CSRF
  const hasSessionCookie = req.cookies?.refreshToken || req.cookies?.session;
  if (!hasSessionCookie) {
    return next();
  }

  // For state-changing cookie-based requests with active session cookies, check header matches cookie
  const csrfHeader = req.headers["x-csrf-token"];
  if (!csrfHeader || csrfHeader !== csrfCookie) {
    res.status(403).json({
      success: false,
      error: {
        code: "CSRF_VALIDATION_FAILED",
        message: "Invalid or missing CSRF token in x-csrf-token header",
      },
    });
    return;
  }

  next();
}
