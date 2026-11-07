import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { AIController } from "./ai.controller";

const router = Router();

router.use(authenticate);

// 1. Quota & Direct Ask
router.get("/quota", AIController.getQuota);
router.post("/ask", AIController.ask);

// 2. Admin Analytics & Quota Management
router.get("/admin/analytics", AIController.getAdminAnalytics);
router.patch("/admin/quotas/:userId", AIController.updateUserQuota);

// 3. Document Indexing (RAG)
router.post("/index/:materialId", AIController.indexMaterial);

// 4. Conversation Threads & Chat History
router.post("/conversations", AIController.createConversation);
router.get("/conversations", AIController.listConversations);
router.get("/conversations/:id", AIController.getConversation);
router.delete("/conversations/:id", AIController.deleteConversation);
router.post("/conversations/:id/messages", AIController.sendMessage);

export default router;
