import { Router } from "express";
import { AuthController } from "./auth.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { createRateLimiter } from "../../middleware/rateLimiter";

const router = Router();

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 mins
  maxRequests: 30,
  message: "Too many authentication attempts. Please try again after 15 minutes.",
});

router.post("/register", authLimiter, AuthController.register);
router.post("/login", authLimiter, AuthController.login);
router.post("/refresh", AuthController.refresh);
router.post("/logout", authenticate, AuthController.logout);
router.get("/sessions", authenticate, AuthController.getSessions);
router.delete("/sessions/:sessionId", authenticate, AuthController.revokeSession);

export default router;
