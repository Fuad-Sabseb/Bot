import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/auth.middleware";
import { MaterialsController } from "./materials.controller";

const router = Router();

// Multer memory storage for learning materials (100MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

router.use(authenticate);

// 1. Statistics & Moderation Queue (place before :id to prevent param collision)
router.get("/stats", MaterialsController.getStats);
router.get("/moderation/queue", MaterialsController.getModerationQueue);

// 2. Resource Collection Endpoints
router.post("/", upload.single("file"), MaterialsController.createMaterial);
router.get("/", MaterialsController.listMaterials);

// 3. Single Resource Endpoints
router.get("/:id", MaterialsController.getMaterial);
router.patch("/:id", MaterialsController.updateMaterial);
router.delete("/:id", MaterialsController.deleteMaterial);
router.get("/:id/download", MaterialsController.downloadMaterial);
router.patch("/:id/moderate", MaterialsController.moderateMaterial);

export default router;
