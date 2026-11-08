import { Router } from "express";
import { RealtimeController } from "./realtime.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

// Public config route for clients to obtain realtime endpoint
router.get("/config", RealtimeController.getConfig);

// Authenticated routes to seal live queries
router.get("/seal/announcements", authenticate, RealtimeController.sealAnnouncements);
router.post("/seal/query", authenticate, RealtimeController.sealQuery);

export default router;
