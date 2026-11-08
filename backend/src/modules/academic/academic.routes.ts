import { Router } from "express";
import { AcademicController } from "./academic.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireGlobalRole } from "../../middleware/rbac.middleware";

const router = Router();

// Student / Instructor enrolled courses
router.get("/my-courses", authenticate, AcademicController.getMyCourses);

// Academic Years & Semesters
router.post("/years", authenticate, requireGlobalRole("ADMIN"), AcademicController.createYear);
router.get("/years", authenticate, AcademicController.listYears);
router.patch("/years/:id/set-current", authenticate, requireGlobalRole("ADMIN"), AcademicController.setCurrentYear);

router.post("/semesters", authenticate, requireGlobalRole("ADMIN"), AcademicController.createSemester);
router.get("/semesters", authenticate, AcademicController.listSemesters);
router.patch("/semesters/:id/set-current", authenticate, requireGlobalRole("ADMIN"), AcademicController.setCurrentSemester);

// Classes
router.post("/classes", authenticate, requireGlobalRole("ADMIN"), AcademicController.createClass);
router.get("/classes", authenticate, AcademicController.listClasses);
router.get("/classes/:id", authenticate, AcademicController.getClass);
router.post("/classes/:id/students", authenticate, requireGlobalRole("ADMIN"), AcademicController.assignStudentToClass);

// Courses
router.post("/courses", authenticate, requireGlobalRole("ADMIN"), AcademicController.createCourse);
router.get("/courses", authenticate, AcademicController.listCourses);

// Offerings
router.post("/offerings", authenticate, requireGlobalRole("ADMIN"), AcademicController.createOffering);
router.get("/offerings", authenticate, AcademicController.listOfferings);
router.get("/offerings/:id", authenticate, AcademicController.getOffering);

// Offering Instructors
router.post("/offerings/:id/instructors", authenticate, requireGlobalRole("ADMIN"), AcademicController.assignInstructor);
router.delete("/offerings/:id/instructors/:instructorId", authenticate, requireGlobalRole("ADMIN"), AcademicController.removeInstructor);

// Enrollments
router.post("/offerings/:id/enroll", authenticate, AcademicController.enrollStudent);
router.post("/offerings/:id/enroll-batch", authenticate, requireGlobalRole("ADMIN"), AcademicController.batchEnrollClass);
router.delete("/offerings/:id/enroll/:userId?", authenticate, AcademicController.dropStudent);

export default router;
