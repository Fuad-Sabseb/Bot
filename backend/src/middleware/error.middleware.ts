import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Redact potential passwords, tokens, and authorization headers from logs
  const safeBody = { ...req.body };
  if (safeBody.password) safeBody.password = "[REDACTED]";
  if (safeBody.token) safeBody.token = "[REDACTED]";
  if (safeBody.refreshToken) safeBody.refreshToken = "[REDACTED]";

  console.error("❌ Centralized Error Handler Caught:", {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    message: err.message || "Unknown error",
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });

  if (res.headersSent) {
    return next(err);
  }

  const statusCode = typeof err.statusCode === "number" ? err.statusCode : 500;
  const errorCode = err.code || (statusCode === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED");
  const message = statusCode === 500 && process.env.NODE_ENV === "production"
    ? "An unexpected internal server error occurred"
    : err.message || "An unexpected error occurred";

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    },
  });
}
