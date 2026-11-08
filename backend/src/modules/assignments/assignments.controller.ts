import { Response } from "express";
import { AuthenticatedRequest } from "../../types/auth";
import { AssignmentsService } from "./assignments.service";
import { StorageService } from "../../services/storage.service";
import path from "path";

export async function createAssignment(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const {
      courseOfferingId,
      title,
      description,
      instructions,
      type,
      minGroupSize,
      maxGroupSize,
      maxMarks,
      dueDate,
      cutoffDate,
      allowResubmission,
    } = req.body;

    if (!courseOfferingId || !title || !description || !dueDate) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: courseOfferingId, title, description, and dueDate are required.",
      });
    }

    const files = req.files as Express.Multer.File[] | undefined;
    const attachmentFiles = files?.map((f) => ({
      buffer: f.buffer,
      originalname: f.originalname,
      mimetype: f.mimetype,
    }));

    const assignment = await AssignmentsService.createAssignment(
      userId,
      {
        courseOfferingId,
        title,
        description,
        instructions,
        type,
        minGroupSize: minGroupSize ? parseInt(minGroupSize, 10) : undefined,
        maxGroupSize: maxGroupSize ? parseInt(maxGroupSize, 10) : undefined,
        maxMarks: maxMarks ? parseFloat(maxMarks) : undefined,
        dueDate: new Date(dueDate),
        cutoffDate: cutoffDate ? new Date(cutoffDate) : undefined,
        allowResubmission:
          allowResubmission !== undefined
            ? allowResubmission === "true" || allowResubmission === true
            : true,
      },
      attachmentFiles
    );

    return res.status(201).json({ success: true, data: assignment });
  } catch (err: any) {
    if (err.message.startsWith("FORBIDDEN")) {
      return res.status(403).json({ success: false, error: err.message });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function updateAssignment(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const assignmentId = req.params.id;
    const {
      title,
      description,
      instructions,
      maxMarks,
      dueDate,
      cutoffDate,
      allowResubmission,
      minGroupSize,
      maxGroupSize,
    } = req.body;

    const updated = await AssignmentsService.updateAssignment(assignmentId, userId, {
      title,
      description,
      instructions,
      maxMarks: maxMarks !== undefined ? parseFloat(maxMarks) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      cutoffDate: cutoffDate ? new Date(cutoffDate) : undefined,
      allowResubmission:
        allowResubmission !== undefined
          ? allowResubmission === "true" || allowResubmission === true
          : undefined,
      minGroupSize: minGroupSize ? parseInt(minGroupSize, 10) : undefined,
      maxGroupSize: maxGroupSize ? parseInt(maxGroupSize, 10) : undefined,
    });

    return res.json({ success: true, data: updated });
  } catch (err: any) {
    if (err.message.startsWith("FORBIDDEN")) {
      return res.status(403).json({ success: false, error: err.message });
    }
    if (err.message === "ASSIGNMENT_NOT_FOUND") {
      return res.status(404).json({ success: false, error: err.message });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function archiveAssignment(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const assignmentId = req.params.id;

    await AssignmentsService.archiveAssignment(assignmentId, userId);
    return res.json({ success: true, message: "Assignment successfully archived." });
  } catch (err: any) {
    if (err.message.startsWith("FORBIDDEN")) {
      return res.status(403).json({ success: false, error: err.message });
    }
    if (err.message === "ASSIGNMENT_NOT_FOUND") {
      return res.status(404).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getAssignment(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const assignmentId = req.params.id;

    const assignment = await AssignmentsService.getAssignmentById(assignmentId, userId);
    return res.json({ success: true, data: assignment });
  } catch (err: any) {
    if (err.message === "ASSIGNMENT_NOT_FOUND") {
      return res.status(404).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function listAssignmentsForOffering(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const offeringId = req.params.offeringId;

    const assignments = await AssignmentsService.listAssignmentsForOffering(offeringId, userId);
    return res.json({ success: true, data: assignments });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getStudentDashboard(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const dashboard = await AssignmentsService.getStudentDashboard(userId);
    return res.json({ success: true, data: dashboard });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function createGroup(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const assignmentId = req.params.id;
    const { name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, error: "Group name is required." });
    }

    const group = await AssignmentsService.createGroup(assignmentId, userId, name);
    return res.status(201).json({ success: true, data: group });
  } catch (err: any) {
    if (err.message.startsWith("FORBIDDEN")) {
      return res.status(403).json({ success: false, error: err.message });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function joinGroup(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const assignmentId = req.params.id;
    const groupId = req.params.groupId;

    const member = await AssignmentsService.joinGroup(assignmentId, groupId, userId);
    return res.status(200).json({ success: true, data: member });
  } catch (err: any) {
    if (err.message.startsWith("FORBIDDEN")) {
      return res.status(403).json({ success: false, error: err.message });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function leaveGroup(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const assignmentId = req.params.id;
    const groupId = req.params.groupId;

    const result = await AssignmentsService.leaveGroup(assignmentId, groupId, userId);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function listGroups(req: AuthenticatedRequest, res: Response) {
  try {
    const assignmentId = req.params.id;
    const groups = await AssignmentsService.listGroups(assignmentId);
    return res.json({ success: true, data: groups });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function submitAssignment(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const assignmentId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded. An assignment file is required." });
    }

    const submission = await AssignmentsService.submitAssignment(
      assignmentId,
      userId,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    return res.status(201).json({ success: true, data: submission });
  } catch (err: any) {
    if (err.message.startsWith("FORBIDDEN")) {
      return res.status(403).json({ success: false, error: err.message });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function getMySubmissions(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const assignmentId = req.params.id;

    const submissions = await AssignmentsService.getMySubmissions(assignmentId, userId);
    return res.json({ success: true, data: submissions });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getAllSubmissions(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const assignmentId = req.params.id;

    const submissions = await AssignmentsService.getAllSubmissions(assignmentId, userId);
    return res.json({ success: true, data: submissions });
  } catch (err: any) {
    if (err.message.startsWith("FORBIDDEN")) {
      return res.status(403).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function gradeSubmission(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const submissionId = req.params.submissionId;
    const { grade, feedback } = req.body;

    if (grade === undefined || grade === null) {
      return res.status(400).json({ success: false, error: "Grade is required." });
    }

    const graded = await AssignmentsService.gradeSubmission(
      submissionId,
      userId,
      parseFloat(grade),
      feedback
    );

    return res.json({ success: true, data: graded });
  } catch (err: any) {
    if (err.message.startsWith("FORBIDDEN")) {
      return res.status(403).json({ success: false, error: err.message });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function downloadFile(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const fileKey = (req.query.fileKey as string) || req.params[0];

    if (!fileKey) {
      return res.status(400).json({ success: false, error: "File key is required." });
    }

    // Verify user authorization to access this file
    const isAuthorized = await AssignmentsService.verifyFileAccess(fileKey, userId);
    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: "Access denied to requested file." });
    }

    const filePath = StorageService.getFilePath(fileKey);
    const fileName = path.basename(filePath);

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return StorageService.getFileStream(fileKey).pipe(res);
  } catch (err: any) {
    if (err.message === "FILE_NOT_FOUND") {
      return res.status(404).json({ success: false, error: "File not found on server storage." });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
}
