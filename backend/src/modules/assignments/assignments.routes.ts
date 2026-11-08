import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/auth.middleware";
import {
  createAssignment,
  updateAssignment,
  archiveAssignment,
  getAssignment,
  listAssignmentsForOffering,
  getStudentDashboard,
  createGroup,
  joinGroup,
  leaveGroup,
  listGroups,
  submitAssignment,
  getMySubmissions,
  getAllSubmissions,
  gradeSubmission,
  downloadFile,
} from "./assignments.controller";

const router = Router();

// Multer memory storage configuration (Max 50MB per file)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

router.use(authenticate);

// Student Dashboard
router.get("/dashboard/student", getStudentDashboard);

// Secure File Download
router.get("/files/download", downloadFile);
router.get("/files/*", downloadFile);

// Course Offering Assignments
router.get("/offering/:offeringId", listAssignmentsForOffering);

// Assignment CRUD
router.post("/", upload.array("attachments", 5), createAssignment);
router.get("/:id", getAssignment);
router.patch("/:id", updateAssignment);
router.delete("/:id", archiveAssignment);

// Submissions
router.post("/:id/submit", upload.single("file"), submitAssignment);
router.get("/:id/submissions/my", getMySubmissions);
router.get("/:id/submissions", getAllSubmissions);
router.patch("/:id/submissions/:submissionId/grade", gradeSubmission);

// Groups for Group Assignments
router.post("/:id/groups", createGroup);
router.get("/:id/groups", listGroups);
router.post("/:id/groups/:groupId/join", joinGroup);
router.post("/:id/groups/:groupId/leave", leaveGroup);

export default router;
