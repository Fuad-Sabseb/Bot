import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/auth.middleware";
import { BlogController } from "./blog.controller";

const router = Router();

// Multer memory storage for cover images (5MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.use(authenticate);

// 1. Static & Sub-path Endpoints (registered before :id / :slugOrId to prevent collisions)
router.post("/upload-cover", upload.single("image"), BlogController.uploadCoverImage);
router.get("/bookmarks", BlogController.listBookmarks);
router.get("/authors/:authorId", BlogController.getAuthorProfile);
router.delete("/comments/:commentId", BlogController.deleteComment);
router.post("/comments/:commentId/report", BlogController.reportComment);

// Admin Moderation Endpoints
router.get("/admin/reports", BlogController.listReports);
router.patch("/admin/reports/:reportId", BlogController.resolveReport);
router.patch("/admin/posts/:id/moderate", BlogController.moderatePost);

// 2. Post Collection Endpoints
router.post("/posts", BlogController.createPost);
router.get("/posts", BlogController.listPosts);

// 3. Post Detail & Interaction Endpoints
router.get("/posts/:slugOrId", BlogController.getPost);
router.patch("/posts/:id", BlogController.updatePost);
router.delete("/posts/:id", BlogController.deletePost);
router.post("/posts/:id/like", BlogController.toggleLike);
router.post("/posts/:id/bookmark", BlogController.toggleBookmark);
router.post("/posts/:id/comments", BlogController.addComment);
router.post("/posts/:id/report", BlogController.reportPost);

export default router;
