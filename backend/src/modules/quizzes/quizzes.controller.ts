import { Request, Response } from "express";
import { QuizzesService } from "./quizzes.service";

export class QuizzesController {
  // ==========================================
  // 1. QUESTION BANK
  // ==========================================

  static async createQuestion(req: Request, res: Response): Promise<void> {
    try {
      const authorId = req.user!.userId;
      const question = await QuizzesService.createQuestion(authorId, req.body);
      res.status(201).json({ success: true, data: question });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async listQuestions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { courseOfferingId, chapter, topic, difficulty, type, search } = req.query;

      const questions = await QuizzesService.listQuestions(userId, {
        courseOfferingId: courseOfferingId as string,
        chapter: chapter as string,
        topic: topic as string,
        difficulty: difficulty as any,
        type: type as any,
        search: search as string,
      });

      res.json({ success: true, data: questions });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getQuestion(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const question = await QuizzesService.getQuestionById(req.params.id, userId);
      res.json({ success: true, data: question });
    } catch (err: any) {
      if (err.message === "QUESTION_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Question not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async updateQuestion(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const updated = await QuizzesService.updateQuestion(userId, req.params.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err.message === "QUESTION_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Question not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async deleteQuestion(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await QuizzesService.deleteQuestion(userId, req.params.id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === "QUESTION_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Question not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async practiceCheck(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { selectedOptionId, textResponse } = req.body;
      const result = await QuizzesService.practiceCheck(userId, req.params.id, selectedOptionId, textResponse);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === "QUESTION_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Question not found." });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  // ==========================================
  // 2. QUIZ MANAGEMENT
  // ==========================================

  static async createQuiz(req: Request, res: Response): Promise<void> {
    try {
      const creatorId = req.user!.userId;
      const quiz = await QuizzesService.createQuiz(creatorId, req.body);
      res.status(201).json({ success: true, data: quiz });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async listQuizzes(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const courseOfferingId = req.query.courseOfferingId as string | undefined;
      const quizzes = await QuizzesService.listQuizzes(userId, courseOfferingId);
      res.json({ success: true, data: quizzes });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getQuiz(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const quiz = await QuizzesService.getQuizById(req.params.id, userId);
      res.json({ success: true, data: quiz });
    } catch (err: any) {
      if (err.message === "QUIZ_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Quiz not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async updateQuiz(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const updated = await QuizzesService.updateQuiz(userId, req.params.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err.message === "QUIZ_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Quiz not found." });
      } else if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async addQuestionToQuiz(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const quizId = req.params.id;
      const { questionId, points, orderIndex } = req.body;

      if (!questionId) {
        res.status(400).json({ success: false, error: "questionId is required." });
        return;
      }

      const result = await QuizzesService.addQuestionToQuiz(userId, quizId, questionId, points, orderIndex);
      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else if (err.message === "QUIZ_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Quiz not found." });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async removeQuestionFromQuiz(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const quizId = req.params.id;
      const questionId = req.params.questionId;

      const result = await QuizzesService.removeQuestionFromQuiz(userId, quizId, questionId);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async getQuizStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const stats = await QuizzesService.getQuizStats(req.params.id, userId);
      res.json({ success: true, data: stats });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else if (err.message === "QUIZ_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Quiz not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  // ==========================================
  // 3. ATTEMPTS & GRADING
  // ==========================================

  static async startAttempt(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const quizId = req.params.id;
      const result = await QuizzesService.startQuizAttempt(userId, quizId);
      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else if (err.message === "QUIZ_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Quiz not found." });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async saveDraft(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const attemptId = req.params.attemptId;
      const { questionId, selectedOptionId, textResponse } = req.body;

      if (!questionId) {
        res.status(400).json({ success: false, error: "questionId is required." });
        return;
      }

      const result = await QuizzesService.saveDraftAnswer(
        userId,
        attemptId,
        questionId,
        selectedOptionId,
        textResponse
      );
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message.startsWith("TIME_EXPIRED") || err.message.startsWith("ATTEMPT_NOT_ACTIVE")) {
        res.status(400).json({ success: false, error: err.message });
      } else if (err.message === "ATTEMPT_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Attempt not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async submitAttempt(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const attemptId = req.params.attemptId;
      const { answers } = req.body;

      const result = await QuizzesService.submitQuizAttempt(userId, attemptId, answers || []);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message.startsWith("ATTEMPT_ALREADY_SUBMITTED")) {
        res.status(400).json({ success: false, error: err.message });
      } else if (err.message === "ATTEMPT_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Attempt not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  static async manualGrade(req: Request, res: Response): Promise<void> {
    try {
      const instructorId = req.user!.userId;
      const attemptId = req.params.attemptId;
      const { questionId, pointsAwarded, feedback } = req.body;

      if (!questionId || pointsAwarded === undefined) {
        res.status(400).json({ success: false, error: "questionId and pointsAwarded are required." });
        return;
      }

      const result = await QuizzesService.manualGradeShortAnswer(
        instructorId,
        attemptId,
        questionId,
        Number(pointsAwarded),
        feedback
      );
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else if (err.message === "ATTEMPT_NOT_FOUND" || err.message === "QUESTION_NOT_IN_QUIZ") {
        res.status(404).json({ success: false, error: err.message });
      } else {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  }

  static async getAttemptReview(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const attemptId = req.params.attemptId;
      const review = await QuizzesService.getAttemptReview(attemptId, userId);
      res.json({ success: true, data: review });
    } catch (err: any) {
      if (err.message.startsWith("FORBIDDEN")) {
        res.status(403).json({ success: false, error: err.message });
      } else if (err.message === "ATTEMPT_NOT_FOUND") {
        res.status(404).json({ success: false, error: "Attempt not found." });
      } else {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }
}
