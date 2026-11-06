import express, { Application, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./modules/auth/auth.routes";
import { errorHandler } from "./middleware/error.middleware";
import { csrfProtection } from "./middleware/csrf.middleware";
import { authenticate } from "./middleware/auth.middleware";
import { requireGlobalRole } from "./middleware/rbac.middleware";

export function createApp(): Application {
  const app = express();

  // 1. Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. CORS
  const allowedOrigins = (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((o) => o.trim());

  app.use(
    cors({
      origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
    })
  );

  // 3. Body & Cookie Parsing
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(cookieParser());

  // 4. CSRF Protection for cookie-based requests
  app.use(csrfProtection);

  // 5. Health Check
  app.get("/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "campus-super-app-backend",
      version: "1.0.0",
    });
  });

  // 6. API v1 Routes
  const v1Router = express.Router();

  v1Router.use("/auth", authRoutes);

  // Protected Profile Route (Test & Verification)
  v1Router.get("/auth/me", authenticate, (req: Request, res: Response) => {
    res.json({
      success: true,
      data: req.user,
    });
  });

  // Protected Admin-Only Route (Verification)
  v1Router.get(
    "/admin/overview",
    authenticate,
    requireGlobalRole("ADMIN"),
    (req: Request, res: Response) => {
      res.json({
        success: true,
        message: "Welcome to authorized admin overview",
      });
    }
  );

  app.use("/api/v1", v1Router);

  // 7. Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export default createApp;
