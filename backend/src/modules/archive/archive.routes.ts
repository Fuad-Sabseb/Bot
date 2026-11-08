import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/auth.middleware";
import { ArchiveController } from "./archive.controller";

const router = Router();

// Multer memory storage for academic archive uploads (100MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

router.use(authenticate);

// 1. Analytics & Moderation Queue
router.get("/stats", ArchiveController.getStats);
router.get("/moderation/queue", ArchiveController.getModerationQueue);

// 2. Archive Collection Endpoints
router.post("/", upload.single("file"), ArchiveController.createResource);
router.get("/", ArchiveController.listResources);

// 3. Single Resource Endpoints
router.get("/:id", ArchiveController.getResource);
router.patch("/:id", ArchiveController.updateResource);
router.delete("/:id", ArchiveController.deleteResource);
router.get("/:id/download", ArchiveController.downloadResource);
router.patch("/:id/moderate", ArchiveController.moderateResource);

export default router;
