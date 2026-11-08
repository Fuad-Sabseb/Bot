import { Request, Response, NextFunction } from "express";
import { AcademicService } from "./academic.service";
import { z } from "zod";

const academicYearSchema = z.object({
  name: z.string().min(4, "Name required (e.g. 2026/2027)"),
  startDate: z.string().transform((v) => new Date(v)),
  endDate: z.string().transform((v) => new Date(v)),
  isCurrent: z.boolean().optional(),
});

const semesterSchema = z.object({
  academicYearId: z.string().uuid(),
  semesterNumber: z.number().int().min(1).max(3),
  name: z.string().min(2),
  startDate: z.string().transform((v) => new Date(v)),
  endDate: z.string().transform((v) => new Date(v)),
  isCurrent: z.boolean().optional(),
});

const classSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  department: z.string().min(2),
  academicYearId: z.string().uuid(),
});

const courseSchema = z.object({
  code: z.string().min(2),
  title: z.string().min(2),
  description: z.string().optional(),
  credits: z.number().int().min(1).max(10).optional(),
});

const courseOfferingSchema = z.object({
  courseId: z.string().uuid(),
  semesterId: z.string().uuid(),
  classId: z.string().uuid(),
  syllabus: z.string().optional(),
});

export class AcademicController {
  // Years & Semesters
  static async createYear(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = academicYearSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
        return;
      }
      const year = await AcademicService.createAcademicYear(parsed.data);
      res.status(201).json({ success: true, data: year });
    } catch (error) {
      next(error);
    }
  }

  static async listYears(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const years = await AcademicService.listAcademicYears();
      res.json({ success: true, data: years });
    } catch (error) {
      next(error);
    }
  }

  static async setCurrentYear(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const year = await AcademicService.setCurrentAcademicYear(req.params.id);
      res.json({ success: true, data: year });
    } catch (error) {
      next(error);
    }
  }

  static async createSemester(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = semesterSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
        return;
      }
      const sem = await AcademicService.createSemester(parsed.data);
      res.status(201).json({ success: true, data: sem });
    } catch (error) {
      next(error);
    }
  }

  static async listSemesters(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sems = await AcademicService.listSemesters(req.query.academicYearId as string);
      res.json({ success: true, data: sems });
    } catch (error) {
      next(error);
    }
  }

  static async setCurrentSemester(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sem = await AcademicService.setCurrentSemester(req.params.id);
      res.json({ success: true, data: sem });
    } catch (error) {
      next(error);
    }
  }

  // Classes
  static async createClass(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = classSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
        return;
      }
      const cls = await AcademicService.createClass(parsed.data);
      res.status(201).json({ success: true, data: cls });
    } catch (error) {
      next(error);
    }
  }

  static async listClasses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const classes = await AcademicService.listClasses(req.query.academicYearId as string);
      res.json({ success: true, data: classes });
    } catch (error) {
      next(error);
    }
  }

  static async getClass(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cls = await AcademicService.getClass(req.params.id);
      res.json({ success: true, data: cls });
    } catch (error) {
      next(error);
    }
  }

  static async assignStudentToClass(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { studentId } = req.body;
      if (!studentId) {
        res.status(400).json({ success: false, error: { code: "MISSING_FIELD", message: "studentId is required" } });
        return;
      }
      const result = await AcademicService.assignStudentToClass(studentId, req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // Courses
  static async createCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = courseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
        return;
      }
      const course = await AcademicService.createCourse(parsed.data);
      res.status(201).json({ success: true, data: course });
    } catch (error) {
      next(error);
    }
  }

  static async listCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courses = await AcademicService.listCourses(req.query.search as string);
      res.json({ success: true, data: courses });
    } catch (error) {
      next(error);
    }
  }

  // Course Offerings
  static async createOffering(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = courseOfferingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
        return;
      }
      const offering = await AcademicService.createCourseOffering(parsed.data);
      res.status(201).json({ success: true, data: offering });
    } catch (error) {
      next(error);
    }
  }

  static async listOfferings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const offerings = await AcademicService.listCourseOfferings({
        semesterId: req.query.semesterId as string,
        classId: req.query.classId as string,
        courseId: req.query.courseId as string,
      });
      res.json({ success: true, data: offerings });
    } catch (error) {
      next(error);
    }
  }

  static async getOffering(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const offering = await AcademicService.getCourseOffering(req.params.id);
      res.json({ success: true, data: offering });
    } catch (error) {
      next(error);
    }
  }

  static async assignInstructor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { instructorId, role } = req.body;
      if (!instructorId) {
        res.status(400).json({ success: false, error: { code: "MISSING_FIELD", message: "instructorId is required" } });
        return;
      }
      const assignment = await AcademicService.assignInstructor(req.params.id, instructorId, role);
      res.status(201).json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  }

  static async removeInstructor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await AcademicService.removeInstructor(req.params.id, req.params.instructorId);
      res.json({ success: true, message: "Instructor removed from offering." });
    } catch (error) {
      next(error);
    }
  }

  // Enrollments
  static async enrollStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { studentId } = req.body;
      const targetUserId = studentId || req.user!.userId;
      const enrollment = await AcademicService.enrollStudent(req.params.id, targetUserId);
      res.status(201).json({ success: true, data: enrollment });
    } catch (error) {
      next(error);
    }
  }

  static async batchEnrollClass(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AcademicService.batchEnrollClass(req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  static async dropStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetUserId = req.params.userId || req.user!.userId;
      const result = await AcademicService.dropStudent(req.params.id, targetUserId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async getMyCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courses = await AcademicService.getMyCourses(req.user!.userId);
      res.json({ success: true, data: courses });
    } catch (error) {
      next(error);
    }
  }
}
