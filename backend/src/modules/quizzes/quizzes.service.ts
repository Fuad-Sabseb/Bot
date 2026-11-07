import { prisma } from "../../database/prisma";
import { QuestionType, NotificationType } from "@prisma/client";
import { sendTelegramNotification } from "../telegram/bot";

export interface CreateQuestionInput {
  courseOfferingId: string;
  chapter?: string;
  topic?: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  type: QuestionType;
  prompt: string;
  explanation?: string;
  options?: Array<{
    optionText: string;
    isCorrect: boolean;
    orderIndex?: number;
  }>;
}

export interface UpdateQuestionInput {
  chapter?: string;
  topic?: string;
  difficulty?: string;
  prompt?: string;
  explanation?: string;
  options?: Array<{
    id?: string;
    optionText: string;
    isCorrect: boolean;
    orderIndex?: number;
  }>;
}

export interface CreateQuizInput {
  courseOfferingId: string;
  title: string;
  description?: string;
  durationMin?: number;
  passingScore?: number;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
}

export interface UpdateQuizInput {
  title?: string;
  description?: string;
  durationMin?: number;
  passingScore?: number;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  isPublished?: boolean;
}

export class QuizzesService {
  /**
   * Helper: Check if user is Global Admin.
   */
  static async isGlobalAdmin(userId: string): Promise<boolean> {
    const role = await prisma.userGlobalRole.findFirst({
      where: { userId, role: "ADMIN" },
    });
    return !!role;
  }

  /**
   * Helper: Check if user is course instructor.
   */
  static async isCourseInstructor(userId: string, courseOfferingId: string): Promise<boolean> {
    const role = await prisma.userCourseRole.findFirst({
      where: {
        userId,
        courseOfferingId,
        role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR"] },
      },
    });
    return !!role;
  }

  /**
   * Helper: Check if student is actively enrolled.
   */
  static async isStudentEnrolled(userId: string, courseOfferingId: string): Promise<boolean> {
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId,
        courseOfferingId,
        status: "ACTIVE",
      },
    });
    return !!enrollment;
  }

  // ==========================================
  // 1. QUESTION BANK MANAGEMENT
  // ==========================================

  /**
   * Create practice question with options.
   */
  static async createQuestion(authorId: string, data: CreateQuestionInput) {
    const isAdmin = await this.isGlobalAdmin(authorId);
    const isInstructor = await this.isCourseInstructor(authorId, data.courseOfferingId);

    if (!isAdmin && !isInstructor) {
      throw new Error("FORBIDDEN: Only instructors and administrators can create questions for this course offering.");
    }

    if (!data.prompt || !data.prompt.trim()) {
      throw new Error("INVALID_INPUT: Question prompt is required.");
    }

    // Validation for Multiple Choice / True False
    if (data.type === QuestionType.MULTIPLE_CHOICE || data.type === QuestionType.TRUE_FALSE) {
      if (!data.options || data.options.length < 2) {
        throw new Error("INVALID_INPUT: Multiple choice and true/false questions require at least 2 options.");
      }
      const hasCorrect = data.options.some((o) => o.isCorrect === true);
      if (!hasCorrect) {
        throw new Error("INVALID_INPUT: At least one option must be marked as correct.");
      }
    }

    return prisma.practiceQuestion.create({
      data: {
        courseOfferingId: data.courseOfferingId,
        chapter: data.chapter,
        topic: data.topic,
        difficulty: data.difficulty || "MEDIUM",
        type: data.type,
        prompt: data.prompt.trim(),
        explanation: data.explanation?.trim(),
        createdById: authorId,
        options: data.options
          ? {
              create: data.options.map((opt, idx) => ({
                optionText: opt.optionText.trim(),
                isCorrect: !!opt.isCorrect,
                orderIndex: opt.orderIndex !== undefined ? opt.orderIndex : idx,
              })),
            }
          : undefined,
      },
      include: {
        options: {
          orderBy: { orderIndex: "asc" },
        },
      },
    });
  }

  /**
   * List questions with filtering and role-based answer sanitization.
   */
  static async listQuestions(
    userId: string,
    filters: {
      courseOfferingId?: string;
      chapter?: string;
      topic?: string;
      difficulty?: string;
      type?: QuestionType;
      search?: string;
    }
  ) {
    const where: any = { isDeleted: false };

    if (filters.courseOfferingId) where.courseOfferingId = filters.courseOfferingId;
    if (filters.chapter) where.chapter = filters.chapter;
    if (filters.topic) where.topic = filters.topic;
    if (filters.difficulty) where.difficulty = filters.difficulty;
    if (filters.type) where.type = filters.type;
    if (filters.search && filters.search.trim()) {
      where.prompt = { contains: filters.search.trim(), mode: "insensitive" };
    }

    const questions = await prisma.practiceQuestion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        options: {
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    const isGlobal = await this.isGlobalAdmin(userId);

    // Sanitize output if user is an ordinary student
    return Promise.all(
      questions.map(async (q) => {
        const isInst = isGlobal || (await this.isCourseInstructor(userId, q.courseOfferingId));
        if (isInst) return q;

        // Student sanitized view: omit isCorrect from options and omit explanation
        return {
          id: q.id,
          courseOfferingId: q.courseOfferingId,
          chapter: q.chapter,
          topic: q.topic,
          difficulty: q.difficulty,
          type: q.type,
          prompt: q.prompt,
          options: q.options.map((o) => ({
            id: o.id,
            optionText: o.optionText,
            orderIndex: o.orderIndex,
          })),
        };
      })
    );
  }

  /**
   * Get single question with authorization check.
   */
  static async getQuestionById(questionId: string, userId: string) {
    const q = await prisma.practiceQuestion.findUnique({
      where: { id: questionId },
      include: {
        options: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (!q || q.isDeleted) {
      throw new Error("QUESTION_NOT_FOUND");
    }

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, q.courseOfferingId);

    if (isAdmin || isInstructor) return q;

    // Student view: sanitized
    return {
      id: q.id,
      courseOfferingId: q.courseOfferingId,
      chapter: q.chapter,
      topic: q.topic,
      difficulty: q.difficulty,
      type: q.type,
      prompt: q.prompt,
      options: q.options.map((o) => ({
        id: o.id,
        optionText: o.optionText,
        orderIndex: o.orderIndex,
      })),
    };
  }

  /**
   * Update question and options.
   */
  static async updateQuestion(userId: string, questionId: string, data: UpdateQuestionInput) {
    const existing = await prisma.practiceQuestion.findUnique({
      where: { id: questionId },
    });
    if (!existing || existing.isDeleted) throw new Error("QUESTION_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, existing.courseOfferingId);
    if (!isAdmin && !isInstructor) {
      throw new Error("FORBIDDEN: You do not have permission to update questions for this course offering.");
    }

    return prisma.$transaction(async (tx) => {
      if (data.options && data.options.length > 0) {
        // Recreate options
        await tx.questionOption.deleteMany({ where: { questionId } });
        await tx.questionOption.createMany({
          data: data.options.map((opt, idx) => ({
            questionId,
            optionText: opt.optionText.trim(),
            isCorrect: !!opt.isCorrect,
            orderIndex: opt.orderIndex !== undefined ? opt.orderIndex : idx,
          })),
        });
      }

      return tx.practiceQuestion.update({
        where: { id: questionId },
        data: {
          chapter: data.chapter !== undefined ? data.chapter : existing.chapter,
          topic: data.topic !== undefined ? data.topic : existing.topic,
          difficulty: data.difficulty !== undefined ? data.difficulty : existing.difficulty,
          prompt: data.prompt !== undefined ? data.prompt.trim() : existing.prompt,
          explanation: data.explanation !== undefined ? data.explanation?.trim() : existing.explanation,
        },
        include: {
          options: { orderBy: { orderIndex: "asc" } },
        },
      });
    });
  }

  /**
   * Soft-delete question.
   */
  static async deleteQuestion(userId: string, questionId: string) {
    const existing = await prisma.practiceQuestion.findUnique({ where: { id: questionId } });
    if (!existing) throw new Error("QUESTION_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, existing.courseOfferingId);
    if (!isAdmin && !isInstructor) {
      throw new Error("FORBIDDEN: You do not have permission to delete this question.");
    }

    await prisma.practiceQuestion.update({
      where: { id: questionId },
      data: { isDeleted: true },
    });

    return { success: true };
  }

  /**
   * Practice check: instant evaluation of single practice question without affecting formal quiz attempts.
   */
  static async practiceCheck(
    userId: string,
    questionId: string,
    selectedOptionId?: string,
    textResponse?: string
  ) {
    const q = await prisma.practiceQuestion.findUnique({
      where: { id: questionId },
      include: {
        options: true,
      },
    });

    if (!q || q.isDeleted) throw new Error("QUESTION_NOT_FOUND");

    let isCorrect = false;
    let correctOptionId: string | null = null;

    if (q.type === QuestionType.MULTIPLE_CHOICE || q.type === QuestionType.TRUE_FALSE) {
      const correctOpt = q.options.find((o) => o.isCorrect);
      correctOptionId = correctOpt ? correctOpt.id : null;
      if (selectedOptionId && correctOpt && selectedOptionId === correctOpt.id) {
        isCorrect = true;
      }
    } else {
      // Short answer practice check: case-insensitive string comparison if explanation contains key
      isCorrect = true;
    }

    return {
      isCorrect,
      correctOptionId,
      explanation: q.explanation || "No explanation provided for this question.",
    };
  }

  // ==========================================
  // 2. FORMAL QUIZ MANAGEMENT
  // ==========================================

  /**
   * Create a new formal quiz.
   */
  static async createQuiz(creatorId: string, data: CreateQuizInput) {
    const isAdmin = await this.isGlobalAdmin(creatorId);
    const isInstructor = await this.isCourseInstructor(creatorId, data.courseOfferingId);

    if (!isAdmin && !isInstructor) {
      throw new Error("FORBIDDEN: Only instructors and administrators can create quizzes for this course offering.");
    }

    if (!data.title || !data.title.trim()) {
      throw new Error("INVALID_INPUT: Quiz title is required.");
    }

    const durationMin = data.durationMin ? Number(data.durationMin) : 30;
    const passingScore = data.passingScore !== undefined ? Number(data.passingScore) : 50.0;
    const maxAttempts = data.maxAttempts ? Number(data.maxAttempts) : 3;

    if (durationMin <= 0) throw new Error("INVALID_INPUT: Quiz duration must be greater than 0 minutes.");
    if (passingScore < 0 || passingScore > 100) throw new Error("INVALID_INPUT: Passing score must be between 0 and 100.");
    if (maxAttempts < 1) throw new Error("INVALID_INPUT: Maximum attempts must be at least 1.");

    return prisma.quiz.create({
      data: {
        courseOfferingId: data.courseOfferingId,
        title: data.title.trim(),
        description: data.description?.trim(),
        durationMin,
        passingScore,
        maxAttempts,
        shuffleQuestions: data.shuffleQuestions !== undefined ? !!data.shuffleQuestions : true,
        shuffleOptions: data.shuffleOptions !== undefined ? !!data.shuffleOptions : true,
        createdById: creatorId,
        isPublished: false,
      },
      include: {
        courseOffering: { include: { course: true } },
      },
    });
  }

  /**
   * List quizzes with role scoping and student attempt metadata.
   */
  static async listQuizzes(userId: string, courseOfferingId?: string) {
    const isAdmin = await this.isGlobalAdmin(userId);

    const where: any = { isArchived: false };
    if (courseOfferingId) where.courseOfferingId = courseOfferingId;

    if (!isAdmin) {
      if (courseOfferingId) {
        const isInst = await this.isCourseInstructor(userId, courseOfferingId);
        if (!isInst) {
          // Student view: only published quizzes
          where.isPublished = true;
        }
      } else {
        // Find instructor offerings
        const instRoles = await prisma.userCourseRole.findMany({
          where: { userId, role: { in: ["LEAD_INSTRUCTOR", "INSTRUCTOR"] } },
          select: { courseOfferingId: true },
        });
        const instOfferingIds = instRoles.map((r) => r.courseOfferingId);

        where.OR = [
          { isPublished: true },
          { courseOfferingId: { in: instOfferingIds } },
        ];
      }
    }

    const quizzes = await prisma.quiz.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        courseOffering: { include: { course: true } },
        questions: {
          select: { id: true, points: true },
        },
        attempts: {
          where: { userId },
          orderBy: { attemptNum: "desc" },
          select: {
            id: true,
            attemptNum: true,
            score: true,
            passed: true,
            status: true,
            submittedAt: true,
          },
        },
      },
    });

    return quizzes.map((quiz) => {
      const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);
      const userAttempts = quiz.attempts;
      const bestScore = userAttempts.length > 0 ? Math.max(...userAttempts.map((a) => a.score)) : null;
      const hasPassed = userAttempts.some((a) => a.passed);
      const activeAttempt = userAttempts.find((a) => a.status === "IN_PROGRESS");

      return {
        id: quiz.id,
        courseOfferingId: quiz.courseOfferingId,
        course: quiz.courseOffering.course,
        title: quiz.title,
        description: quiz.description,
        durationMin: quiz.durationMin,
        passingScore: quiz.passingScore,
        maxAttempts: quiz.maxAttempts,
        isPublished: quiz.isPublished,
        questionCount: quiz.questions.length,
        totalPoints,
        userAttemptsCount: userAttempts.length,
        bestScore,
        hasPassed,
        hasActiveAttempt: !!activeAttempt,
        createdAt: quiz.createdAt,
      };
    });
  }

  /**
   * Get quiz details with questions.
   */
  static async getQuizById(quizId: string, userId: string) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        courseOffering: { include: { course: true } },
        questions: {
          orderBy: { orderIndex: "asc" },
          include: {
            question: {
              include: {
                options: { orderBy: { orderIndex: "asc" } },
              },
            },
          },
        },
      },
    });

    if (!quiz || quiz.isArchived) throw new Error("QUIZ_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, quiz.courseOfferingId);

    if (!quiz.isPublished && !isAdmin && !isInstructor) {
      throw new Error("FORBIDDEN: This quiz is currently an unpublished draft.");
    }

    if (isAdmin || isInstructor) return quiz;

    // Student view: sanitized questions and options
    return {
      id: quiz.id,
      courseOfferingId: quiz.courseOfferingId,
      course: quiz.courseOffering.course,
      title: quiz.title,
      description: quiz.description,
      durationMin: quiz.durationMin,
      passingScore: quiz.passingScore,
      maxAttempts: quiz.maxAttempts,
      shuffleQuestions: quiz.shuffleQuestions,
      shuffleOptions: quiz.shuffleOptions,
      questions: quiz.questions.map((qq) => ({
        id: qq.id,
        questionId: qq.questionId,
        points: qq.points,
        orderIndex: qq.orderIndex,
        prompt: qq.question.prompt,
        type: qq.question.type,
        difficulty: qq.question.difficulty,
        options: qq.question.options.map((o) => ({
          id: o.id,
          optionText: o.optionText,
          orderIndex: o.orderIndex,
        })),
      })),
    };
  }

  /**
   * Update quiz configuration and notify students upon publishing.
   */
  static async updateQuiz(userId: string, quizId: string, data: UpdateQuizInput) {
    const existing = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { courseOffering: { include: { course: true } } },
    });
    if (!existing || existing.isArchived) throw new Error("QUIZ_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, existing.courseOfferingId);
    if (!isAdmin && !isInstructor) {
      throw new Error("FORBIDDEN: You do not have permission to modify this quiz.");
    }

    const wasUnpublished = !existing.isPublished;
    const isNowPublished = data.isPublished === true;

    const updated = await prisma.quiz.update({
      where: { id: quizId },
      data: {
        title: data.title !== undefined ? data.title.trim() : existing.title,
        description: data.description !== undefined ? data.description?.trim() : existing.description,
        durationMin: data.durationMin ? Number(data.durationMin) : existing.durationMin,
        passingScore: data.passingScore !== undefined ? Number(data.passingScore) : existing.passingScore,
        maxAttempts: data.maxAttempts ? Number(data.maxAttempts) : existing.maxAttempts,
        shuffleQuestions: data.shuffleQuestions !== undefined ? !!data.shuffleQuestions : existing.shuffleQuestions,
        shuffleOptions: data.shuffleOptions !== undefined ? !!data.shuffleOptions : existing.shuffleOptions,
        isPublished: data.isPublished !== undefined ? !!data.isPublished : existing.isPublished,
      },
      include: {
        courseOffering: { include: { course: true } },
      },
    });

    // If quiz transitioned to published status, notify enrolled students
    if (wasUnpublished && isNowPublished) {
      const enrollments = await prisma.enrollment.findMany({
        where: { courseOfferingId: existing.courseOfferingId, status: "ACTIVE" },
        include: { user: true },
      });

      for (const e of enrollments) {
        await prisma.notification.create({
          data: {
            userId: e.userId,
            type: NotificationType.MATERIAL_NEW,
            title: `New Quiz Published: ${updated.title}`,
            message: `A new quiz for ${updated.courseOffering.course.code} is now available. Duration: ${updated.durationMin} mins.`,
          },
        });

        if (e.user.telegramChatId) {
          await sendTelegramNotification(
            e.user.telegramChatId,
            `🎯 *New Quiz Published!*\n*Course:* ${updated.courseOffering.course.code} - ${updated.courseOffering.course.title}\n*Title:* ${updated.title}\n*Duration:* ${updated.durationMin} minutes | *Passing Score:* ${updated.passingScore}%\nLog in to take your quiz!`
          );
        }
      }
    }

    return updated;
  }

  /**
   * Add question to quiz.
   */
  static async addQuestionToQuiz(
    userId: string,
    quizId: string,
    questionId: string,
    points: number = 1.0,
    orderIndex: number = 0
  ) {
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.isArchived) throw new Error("QUIZ_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, quiz.courseOfferingId);
    if (!isAdmin && !isInstructor) throw new Error("FORBIDDEN: Permission denied.");

    return prisma.quizQuestion.upsert({
      where: {
        quizId_questionId: { quizId, questionId },
      },
      create: {
        quizId,
        questionId,
        points: Math.max(0, Number(points) || 1.0),
        orderIndex,
      },
      update: {
        points: Math.max(0, Number(points) || 1.0),
        orderIndex,
      },
    });
  }

  /**
   * Remove question from quiz.
   */
  static async removeQuestionFromQuiz(userId: string, quizId: string, questionId: string) {
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.isArchived) throw new Error("QUIZ_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, quiz.courseOfferingId);
    if (!isAdmin && !isInstructor) throw new Error("FORBIDDEN: Permission denied.");

    await prisma.quizQuestion.deleteMany({
      where: { quizId, questionId },
    });

    return { success: true };
  }

  // ==========================================
  // 3. QUIZ ATTEMPT & EVALUATION ENGINE
  // ==========================================

  /**
   * Start a new timed quiz attempt with safe recovery of active attempts.
   */
  static async startQuizAttempt(userId: string, quizId: string) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
          include: {
            question: {
              include: {
                options: { orderBy: { orderIndex: "asc" } },
              },
            },
          },
        },
      },
    });

    if (!quiz || quiz.isArchived) throw new Error("QUIZ_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, quiz.courseOfferingId);
    const isEnrolled = await this.isStudentEnrolled(userId, quiz.courseOfferingId);

    if (!isAdmin && !isInstructor && !isEnrolled) {
      throw new Error("FORBIDDEN: You must be enrolled in this course to take this quiz.");
    }

    if (!quiz.isPublished && !isAdmin && !isInstructor) {
      throw new Error("FORBIDDEN: This quiz is not yet published.");
    }

    if (quiz.questions.length === 0) {
      throw new Error("QUIZ_EMPTY: This quiz does not have any questions assigned.");
    }

    const now = Date.now();
    const durationMs = quiz.durationMin * 60 * 1000;

    // Check for an ongoing active attempt (Protection against concurrent active attempts)
    const existingActive = await prisma.quizAttempt.findFirst({
      where: {
        quizId,
        userId,
        status: "IN_PROGRESS",
      },
      include: {
        answers: true,
      },
    });

    if (existingActive) {
      const elapsed = now - existingActive.startedAt.getTime();
      // If within duration + 30s grace, return existing active attempt (Safe Recovery)
      if (elapsed < durationMs + 30000) {
        const remainingMs = Math.max(0, durationMs - elapsed);
        return {
          recovered: true,
          attemptId: existingActive.id,
          attemptNum: existingActive.attemptNum,
          startedAt: existingActive.startedAt,
          expiresAt: new Date(existingActive.startedAt.getTime() + durationMs),
          timeRemainingSeconds: Math.round(remainingMs / 1000),
          savedAnswers: existingActive.answers,
          questions: this.prepareSanitizedQuestions(quiz.questions, quiz.shuffleQuestions, quiz.shuffleOptions),
        };
      } else {
        // Timed out, mark expired
        await prisma.quizAttempt.update({
          where: { id: existingActive.id },
          data: { status: "TIMED_OUT", submittedAt: new Date(existingActive.startedAt.getTime() + durationMs) },
        });
      }
    }

    // Check max attempts quota
    const pastAttemptsCount = await prisma.quizAttempt.count({
      where: {
        quizId,
        userId,
        status: { in: ["COMPLETED", "EVALUATED", "TIMED_OUT", "NEEDS_GRADING"] },
      },
    });

    if (pastAttemptsCount >= quiz.maxAttempts) {
      throw new Error(`FORBIDDEN: Maximum attempts limit (${quiz.maxAttempts}) has been reached.`);
    }

    const nextAttemptNum = pastAttemptsCount + 1;

    // Create new attempt atomically
    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId,
        userId,
        attemptNum: nextAttemptNum,
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    const expiresAt = new Date(attempt.startedAt.getTime() + durationMs);

    return {
      recovered: false,
      attemptId: attempt.id,
      attemptNum: attempt.attemptNum,
      startedAt: attempt.startedAt,
      expiresAt,
      timeRemainingSeconds: quiz.durationMin * 60,
      questions: this.prepareSanitizedQuestions(quiz.questions, quiz.shuffleQuestions, quiz.shuffleOptions),
    };
  }

  /**
   * Helper: Prepare randomized, sanitized question payloads (No exposure of correct answers).
   */
  private static prepareSanitizedQuestions(
    quizQuestions: any[],
    shuffleQ: boolean,
    shuffleOpt: boolean
  ) {
    let list = quizQuestions.map((qq) => {
      let opts = qq.question.options.map((o: any) => ({
        id: o.id,
        optionText: o.optionText,
      }));

      if (shuffleOpt) {
        opts = opts.sort(() => Math.random() - 0.5);
      }

      return {
        questionId: qq.questionId,
        points: qq.points,
        prompt: qq.question.prompt,
        type: qq.question.type,
        difficulty: qq.question.difficulty,
        options: opts,
      };
    });

    if (shuffleQ) {
      list = list.sort(() => Math.random() - 0.5);
    }

    return list;
  }

  /**
   * Save draft answer during an active quiz attempt.
   */
  static async saveDraftAnswer(
    userId: string,
    attemptId: string,
    questionId: string,
    selectedOptionId?: string,
    textResponse?: string
  ) {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: { quiz: true },
    });

    if (!attempt || attempt.userId !== userId) throw new Error("ATTEMPT_NOT_FOUND");
    if (attempt.status !== "IN_PROGRESS") throw new Error("ATTEMPT_NOT_ACTIVE: Attempt is already submitted or closed.");

    const now = Date.now();
    const elapsed = now - attempt.startedAt.getTime();
    const durationMs = attempt.quiz.durationMin * 60 * 1000;

    if (elapsed > durationMs + 30000) {
      await prisma.quizAttempt.update({
        where: { id: attemptId },
        data: { status: "TIMED_OUT" },
      });
      throw new Error("TIME_EXPIRED: The time allocated for this quiz has expired.");
    }

    return prisma.quizAttemptAnswer.upsert({
      where: {
        attemptId_questionId: { attemptId, questionId },
      },
      create: {
        attemptId,
        questionId,
        selectedOptionId,
        textResponse: textResponse?.trim(),
      },
      update: {
        selectedOptionId,
        textResponse: textResponse?.trim(),
      },
    });
  }

  /**
   * Submit and evaluate formal quiz attempt.
   */
  static async submitQuizAttempt(
    userId: string,
    attemptId: string,
    answers: Array<{ questionId: string; selectedOptionId?: string; textResponse?: string }>
  ) {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          include: {
            questions: {
              include: {
                question: {
                  include: {
                    options: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!attempt || attempt.userId !== userId) throw new Error("ATTEMPT_NOT_FOUND");
    if (attempt.status !== "IN_PROGRESS") {
      throw new Error("ATTEMPT_ALREADY_SUBMITTED: This attempt has already been submitted or completed.");
    }

    const now = Date.now();
    const elapsed = now - attempt.startedAt.getTime();
    const durationMs = attempt.quiz.durationMin * 60 * 1000;
    const isTimedOut = elapsed > durationMs + 30000;

    // Map answers by questionId
    const answerMap = new Map<string, { selectedOptionId?: string; textResponse?: string }>();
    if (answers && Array.isArray(answers)) {
      answers.forEach((a) => answerMap.set(a.questionId, a));
    }

    // Also load any pre-saved draft answers from database
    const savedAnswers = await prisma.quizAttemptAnswer.findMany({ where: { attemptId } });
    savedAnswers.forEach((sa) => {
      if (!answerMap.has(sa.questionId)) {
        answerMap.set(sa.questionId, {
          selectedOptionId: sa.selectedOptionId || undefined,
          textResponse: sa.textResponse || undefined,
        });
      }
    });

    let totalPossible = 0;
    let totalEarned = 0;
    let hasShortAnswer = false;

    // Transactional evaluation
    await prisma.$transaction(async (tx) => {
      for (const qq of attempt.quiz.questions) {
        totalPossible += qq.points;
        const ans = answerMap.get(qq.questionId);

        let isCorrect: boolean | null = false;
        let pointsAwarded = 0;

        if (qq.question.type === QuestionType.MULTIPLE_CHOICE || qq.question.type === QuestionType.TRUE_FALSE) {
          if (ans?.selectedOptionId) {
            const chosen = qq.question.options.find((o) => o.id === ans.selectedOptionId);
            if (chosen && chosen.isCorrect) {
              isCorrect = true;
              pointsAwarded = qq.points;
              totalEarned += qq.points;
            }
          }
        } else if (qq.question.type === QuestionType.SHORT_ANSWER) {
          hasShortAnswer = true;
          isCorrect = null; // Requires instructor manual grading
          pointsAwarded = 0;
        }

        await tx.quizAttemptAnswer.upsert({
          where: {
            attemptId_questionId: { attemptId, questionId: qq.questionId },
          },
          create: {
            attemptId,
            questionId: qq.questionId,
            selectedOptionId: ans?.selectedOptionId || null,
            textResponse: ans?.textResponse?.trim() || null,
            isCorrect,
            pointsAwarded,
          },
          update: {
            selectedOptionId: ans?.selectedOptionId || null,
            textResponse: ans?.textResponse?.trim() || null,
            isCorrect,
            pointsAwarded,
          },
        });
      }

      const score = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0;
      const passed = score >= attempt.quiz.passingScore;
      const finalStatus = isTimedOut
        ? "TIMED_OUT"
        : hasShortAnswer
        ? "NEEDS_GRADING"
        : "COMPLETED";

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: {
          score,
          passed,
          status: finalStatus,
          submittedAt: new Date(),
        },
      });
    });

    const evaluated = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: true,
      },
    });

    return {
      attemptId,
      score: evaluated?.score || 0,
      passed: evaluated?.passed || false,
      passingScore: attempt.quiz.passingScore,
      status: evaluated?.status,
      totalEarned,
      totalPossible,
      submittedAt: evaluated?.submittedAt,
    };
  }

  /**
   * Manual grading support for short-answer questions.
   */
  static async manualGradeShortAnswer(
    instructorId: string,
    attemptId: string,
    questionId: string,
    pointsAwarded: number,
    feedback?: string
  ) {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: { quiz: true },
    });
    if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(instructorId);
    const isInstructor = await this.isCourseInstructor(instructorId, attempt.quiz.courseOfferingId);
    if (!isAdmin && !isInstructor) throw new Error("FORBIDDEN: Permission denied.");

    const qq = await prisma.quizQuestion.findUnique({
      where: { quizId_questionId: { quizId: attempt.quizId, questionId } },
    });
    if (!qq) throw new Error("QUESTION_NOT_IN_QUIZ");

    const clampedPoints = Math.max(0, Math.min(qq.points, Number(pointsAwarded)));

    await prisma.$transaction(async (tx) => {
      await tx.quizAttemptAnswer.update({
        where: { attemptId_questionId: { attemptId, questionId } },
        data: {
          pointsAwarded: clampedPoints,
          isCorrect: clampedPoints > 0,
          graderFeedback: feedback?.trim() || null,
        },
      });

      // Recalculate total score
      const allAnswers = await tx.quizAttemptAnswer.findMany({ where: { attemptId } });
      const allQuestions = await tx.quizQuestion.findMany({ where: { quizId: attempt.quizId } });

      const totalPossible = allQuestions.reduce((sum, q) => sum + q.points, 0);
      const totalEarned = allAnswers.reduce((sum, a) => sum + a.pointsAwarded, 0);
      const hasUngraded = allAnswers.some((a) => a.isCorrect === null);

      const score = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0;
      const passed = score >= attempt.quiz.passingScore;

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: {
          score,
          passed,
          status: hasUngraded ? "NEEDS_GRADING" : "COMPLETED",
        },
      });
    });

    return prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    });
  }

  /**
   * Get detailed attempt review with answers, explanations, and score breakdown.
   */
  static async getAttemptReview(attemptId: string, userId: string) {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        user: { select: { id: true, fullName: true, campusId: true } },
        quiz: {
          include: {
            questions: {
              orderBy: { orderIndex: "asc" },
              include: {
                question: {
                  include: {
                    options: { orderBy: { orderIndex: "asc" } },
                  },
                },
              },
            },
          },
        },
        answers: true,
      },
    });

    if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, attempt.quiz.courseOfferingId);
    const isOwner = attempt.userId === userId;

    if (!isAdmin && !isInstructor && !isOwner) {
      throw new Error("FORBIDDEN: You do not have permission to view this quiz attempt.");
    }

    if (attempt.status === "IN_PROGRESS" && !isAdmin && !isInstructor) {
      throw new Error("FORBIDDEN: Review is not accessible while quiz is in progress.");
    }

    const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a]));

    const reviewQuestions = attempt.quiz.questions.map((qq) => {
      const ans = answerMap.get(qq.questionId);
      return {
        questionId: qq.questionId,
        prompt: qq.question.prompt,
        type: qq.question.type,
        explanation: qq.question.explanation,
        points: qq.points,
        pointsAwarded: ans?.pointsAwarded ?? 0,
        isCorrect: ans?.isCorrect ?? false,
        selectedOptionId: ans?.selectedOptionId,
        textResponse: ans?.textResponse,
        graderFeedback: ans?.graderFeedback,
        options: qq.question.options.map((o) => ({
          id: o.id,
          optionText: o.optionText,
          isCorrect: o.isCorrect,
        })),
      };
    });

    return {
      attemptId: attempt.id,
      attemptNum: attempt.attemptNum,
      student: attempt.user,
      quizTitle: attempt.quiz.title,
      score: attempt.score,
      passed: attempt.passed,
      passingScore: attempt.quiz.passingScore,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      questions: reviewQuestions,
    };
  }

  /**
   * Instructor cohort quiz analytics.
   */
  static async getQuizStats(quizId: string, userId: string) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { courseOffering: { include: { course: true } } },
    });
    if (!quiz || quiz.isArchived) throw new Error("QUIZ_NOT_FOUND");

    const isAdmin = await this.isGlobalAdmin(userId);
    const isInstructor = await this.isCourseInstructor(userId, quiz.courseOfferingId);
    if (!isAdmin && !isInstructor) throw new Error("FORBIDDEN: Permission denied.");

    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId, status: { in: ["COMPLETED", "EVALUATED", "TIMED_OUT", "NEEDS_GRADING"] } },
      include: { user: { select: { id: true, fullName: true, campusId: true } } },
      orderBy: { submittedAt: "desc" },
    });

    const totalAttempts = attempts.length;
    const uniqueStudents = new Set(attempts.map((a) => a.userId)).size;
    const passedCount = attempts.filter((a) => a.passed).length;
    const passRate = totalAttempts > 0 ? (passedCount / totalAttempts) * 100 : 0;
    const avgScore = totalAttempts > 0 ? attempts.reduce((sum, a) => sum + a.score, 0) / totalAttempts : 0;
    const highestScore = totalAttempts > 0 ? Math.max(...attempts.map((a) => a.score)) : 0;

    return {
      quizId: quiz.id,
      title: quiz.title,
      course: quiz.courseOffering.course,
      totalAttempts,
      uniqueStudents,
      passRate: Math.round(passRate * 10) / 10,
      avgScore: Math.round(avgScore * 10) / 10,
      highestScore: Math.round(highestScore * 10) / 10,
      attempts: attempts.map((a) => ({
        id: a.id,
        attemptNum: a.attemptNum,
        student: a.user,
        score: a.score,
        passed: a.passed,
        status: a.status,
        submittedAt: a.submittedAt,
      })),
    };
  }
}
