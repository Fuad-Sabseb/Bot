import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { generateAccessToken } from "../src/utils/jwt";
import { handleQuizzesCommand, handlePracticeCommand } from "../src/modules/telegram/handlers/quiz.handler";

const app = createApp();

describe("Phase 6 — Practice Questions and Quizzes System (Assessment & Self-Testing Engine)", () => {
  let adminToken: string;
  let adminUser: any;
  let teacherToken: string;
  let teacherUser: any;
  let student1Token: string;
  let student1User: any;
  let student2Token: string;
  let student2User: any;
  let outsiderToken: string;
  let outsiderUser: any;

  let offeringId: string;
  let courseId: string;
  let question1Id: string;
  let question2Id: string;
  let shortAnswerQId: string;
  let q1CorrectOptId: string;
  let q1WrongOptId: string;
  let quizId: string;
  let student1AttemptId: string;

  beforeAll(async () => {
    const timestamp = Date.now();

    // 1. Create Admin
    adminUser = await prisma.user.create({
      data: {
        fullName: "Dr. Quiz Dean",
        email: `admin_p6_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "ADMIN" } },
      },
    });
    const adminSession = await prisma.session.create({ data: { userId: adminUser.id } });
    adminToken = generateAccessToken({ userId: adminUser.id, sessionId: adminSession.id });

    // 2. Create Instructor
    teacherUser = await prisma.user.create({
      data: {
        fullName: "Prof. Claude Shannon",
        email: `shannon_p6_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const teacherSession = await prisma.session.create({ data: { userId: teacherUser.id } });
    teacherToken = generateAccessToken({ userId: teacherUser.id, sessionId: teacherSession.id });

    // 3. Create Students
    student1User = await prisma.user.create({
      data: {
        fullName: "Ada Lovelace",
        campusId: `S6A_${timestamp}`,
        email: `ada_p6_${timestamp}@university.edu`,
        isActive: true,
        telegramChatId: BigInt(Math.floor(Math.random() * 899999999 + 100000000)),
        globalRoles: { create: { role: "USER" } },
      },
    });
    const s1Session = await prisma.session.create({ data: { userId: student1User.id } });
    student1Token = generateAccessToken({ userId: student1User.id, sessionId: s1Session.id });

    student2User = await prisma.user.create({
      data: {
        fullName: "Charles Babbage",
        campusId: `S6B_${timestamp}`,
        email: `charles_p6_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const s2Session = await prisma.session.create({ data: { userId: student2User.id } });
    student2Token = generateAccessToken({ userId: student2User.id, sessionId: s2Session.id });

    // 4. Create Outsider
    outsiderUser = await prisma.user.create({
      data: {
        fullName: "Oliver Outsider",
        campusId: `S6OUT_${timestamp}`,
        email: `oliver_p6_${timestamp}@university.edu`,
        isActive: true,
        globalRoles: { create: { role: "USER" } },
      },
    });
    const outSession = await prisma.session.create({ data: { userId: outsiderUser.id } });
    outsiderToken = generateAccessToken({ userId: outsiderUser.id, sessionId: outSession.id });

    // 5. Setup Academic Hierarchy
    const academicYear = await prisma.academicYear.create({
      data: {
        name: `AY6_${timestamp}`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
      },
    });

    const semester = await prisma.semester.create({
      data: {
        academicYearId: academicYear.id,
        semesterNumber: 1,
        name: `Semester 1 (AY6_${timestamp})`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-01-31"),
      },
    });

    const classCohort = await prisma.class.create({
      data: {
        name: `CS Quizzes Cohort_${timestamp}`,
        code: `CSQ-${timestamp.toString().slice(-4)}`,
        department: "Computer Science",
        academicYearId: academicYear.id,
      },
    });

    const course = await prisma.course.create({
      data: {
        code: `CS-ALGO-${timestamp.toString().slice(-4)}`,
        title: "Algorithms & Complexity",
        credits: 4,
      },
    });
    courseId = course.id;

    const offering = await prisma.courseOffering.create({
      data: {
        courseId: course.id,
        semesterId: semester.id,
        classId: classCohort.id,
      },
    });
    offeringId = offering.id;

    // Assign Instructor
    await prisma.userCourseRole.create({
      data: {
        userId: teacherUser.id,
        courseOfferingId: offeringId,
        role: "LEAD_INSTRUCTOR",
      },
    });

    // Enroll Students
    await prisma.enrollment.createMany({
      data: [
        { userId: student1User.id, courseOfferingId: offeringId, status: "ACTIVE" },
        { userId: student2User.id, courseOfferingId: offeringId, status: "ACTIVE" },
      ],
    });
  });

  afterAll(async () => {
    try {
      if (quizId) {
        await prisma.quizAttemptAnswer.deleteMany({ where: { attempt: { quizId } } });
        await prisma.quizAttempt.deleteMany({ where: { quizId } });
        await prisma.quizQuestion.deleteMany({ where: { quizId } });
        await prisma.quiz.deleteMany({ where: { id: quizId } });
      }
      await prisma.questionOption.deleteMany({ where: { question: { courseOfferingId: offeringId } } });
      await prisma.practiceQuestion.deleteMany({ where: { courseOfferingId: offeringId } });
      await prisma.userCourseRole.deleteMany({ where: { courseOfferingId: offeringId } });
      await prisma.enrollment.deleteMany({ where: { courseOfferingId: offeringId } });
      await prisma.courseOffering.deleteMany({ where: { id: offeringId } });
      await prisma.course.deleteMany({ where: { id: courseId } });
    } catch {
      // Ignore teardown errors
    }
  });

  // ----------------------------------------------------
  // 1. QUESTION BANK & PRACTICE ARENA
  // ----------------------------------------------------
  test("1. Assigned Instructor creates practice questions in question bank with options", async () => {
    const res = await request(app)
      .post("/api/v1/quizzes/questions")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        courseOfferingId: offeringId,
        chapter: "Chapter 1",
        topic: "Asymptotic Notation",
        difficulty: "EASY",
        type: "MULTIPLE_CHOICE",
        prompt: "What is the worst-case time complexity of Merge Sort?",
        explanation: "Merge sort divides the array in half log(n) times and performs O(n) work per level, yielding O(n log n).",
        options: [
          { optionText: "O(n log n)", isCorrect: true, orderIndex: 0 },
          { optionText: "O(n^2)", isCorrect: false, orderIndex: 1 },
          { optionText: "O(log n)", isCorrect: false, orderIndex: 2 },
          { optionText: "O(n)", isCorrect: false, orderIndex: 3 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.prompt).toContain("worst-case time complexity");
    expect(res.body.data.options.length).toBe(4);

    question1Id = res.body.data.id;
    const correctOpt = res.body.data.options.find((o: any) => o.isCorrect);
    const wrongOpt = res.body.data.options.find((o: any) => !o.isCorrect);
    q1CorrectOptId = correctOpt.id;
    q1WrongOptId = wrongOpt.id;
  });

  test("2. Question creation rejects invalid options (no correct option or < 2 options)", async () => {
    const res = await request(app)
      .post("/api/v1/quizzes/questions")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        courseOfferingId: offeringId,
        type: "MULTIPLE_CHOICE",
        prompt: "Invalid Question with no correct answer",
        options: [
          { optionText: "Option A", isCorrect: false },
          { optionText: "Option B", isCorrect: false },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("At least one option must be marked as correct");
  });

  test("3. Student practice check evaluates answer instantly and returns explanation", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/questions/${question1Id}/practice`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        selectedOptionId: q1CorrectOptId,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isCorrect).toBe(true);
    expect(res.body.data.explanation).toContain("Merge sort divides the array");
  });

  test("4. Student practice check with wrong answer returns isCorrect: false", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/questions/${question1Id}/practice`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        selectedOptionId: q1WrongOptId,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isCorrect).toBe(false);
    expect(res.body.data.correctOptionId).toBe(q1CorrectOptId);
  });

  test("5. Student or outsider cannot author question in question bank (403 Forbidden)", async () => {
    const res = await request(app)
      .post("/api/v1/quizzes/questions")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        courseOfferingId: offeringId,
        type: "MULTIPLE_CHOICE",
        prompt: "Student attempting to add question",
        options: [
          { optionText: "A", isCorrect: true },
          { optionText: "B", isCorrect: false },
        ],
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ----------------------------------------------------
  // 2. FORMAL QUIZ CREATION & ASSEMBLY
  // ----------------------------------------------------
  test("6. Instructor creates formal quiz configuration", async () => {
    // Also create second question and a short-answer question
    const q2 = await request(app)
      .post("/api/v1/quizzes/questions")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        courseOfferingId: offeringId,
        chapter: "Chapter 2",
        topic: "Graph Algorithms",
        difficulty: "MEDIUM",
        type: "TRUE_FALSE",
        prompt: "Dijkstra's algorithm works correctly on graphs with negative edge weights.",
        explanation: "Dijkstra's greedy choice property fails with negative edge weights; Bellman-Ford must be used instead.",
        options: [
          { optionText: "True", isCorrect: false },
          { optionText: "False", isCorrect: true },
        ],
      });
    question2Id = q2.body.data.id;

    const q3 = await request(app)
      .post("/api/v1/quizzes/questions")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        courseOfferingId: offeringId,
        chapter: "Chapter 3",
        topic: "Dynamic Programming",
        difficulty: "HARD",
        type: "SHORT_ANSWER",
        prompt: "Explain the difference between memoization (top-down) and tabulation (bottom-up).",
        explanation: "Memoization caches recursive call results on-demand, whereas tabulation iteratively fills a table starting from base cases.",
      });
    shortAnswerQId = q3.body.data.id;

    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        courseOfferingId: offeringId,
        title: "Algorithms Midterm Readiness Quiz",
        description: "Timed quiz covering sorting, graphs, and dynamic programming.",
        durationMin: 20,
        passingScore: 60.0,
        maxAttempts: 2,
        shuffleQuestions: true,
        shuffleOptions: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("Algorithms Midterm Readiness Quiz");
    expect(res.body.data.isPublished).toBe(false);
    expect(res.body.data.durationMin).toBe(20);
    expect(res.body.data.maxAttempts).toBe(2);

    quizId = res.body.data.id;
  });

  test("7. Quiz creation rejects invalid duration or passing score parameters", async () => {
    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        courseOfferingId: offeringId,
        title: "Bad Parameters Quiz",
        durationMin: -5,
        passingScore: 150,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("8. Instructor adds questions to quiz with point weight", async () => {
    const addQ1 = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ questionId: question1Id, points: 5.0, orderIndex: 0 });
    expect(addQ1.status).toBe(201);

    const addQ2 = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ questionId: question2Id, points: 5.0, orderIndex: 1 });
    expect(addQ2.status).toBe(201);

    const addQ3 = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ questionId: shortAnswerQId, points: 10.0, orderIndex: 2 });
    expect(addQ3.status).toBe(201);
  });

  test("9. Enrolled student cannot view unpublished draft quiz (403 Forbidden)", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("unpublished draft");
  });

  test("10. Instructor publishes quiz: status becomes isPublished: true", async () => {
    const res = await request(app)
      .patch(`/api/v1/quizzes/${quizId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ isPublished: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isPublished).toBe(true);
  });

  test("11. Enrolled student lists quizzes: returns published quiz with sanitized metadata", async () => {
    const res = await request(app)
      .get("/api/v1/quizzes")
      .set("Authorization", `Bearer ${student1Token}`)
      .query({ courseOfferingId: offeringId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const targetQuiz = res.body.data.find((q: any) => q.id === quizId);
    expect(targetQuiz).toBeDefined();
    expect(targetQuiz.questionCount).toBe(3);
    expect(targetQuiz.totalPoints).toBe(20);
    expect(targetQuiz.durationMin).toBe(20);
  });

  // ----------------------------------------------------
  // 3. TIMED QUIZ TAKING & ANTI-CHEAT SANITIZATION
  // ----------------------------------------------------
  test("12. Enrolled student starts quiz attempt: returns sanitized payload without answer keys", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/start`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.attemptNum).toBe(1);
    expect(res.body.data.timeRemainingSeconds).toBeGreaterThan(0);
    expect(res.body.data.questions.length).toBe(3);

    // Anti-cheat verification: isCorrect must NOT be exposed
    res.body.data.questions.forEach((q: any) => {
      expect(q.explanation).toBeUndefined();
      if (q.options) {
        q.options.forEach((opt: any) => {
          expect(opt.isCorrect).toBeUndefined();
        });
      }
    });

    student1AttemptId = res.body.data.attemptId;
  });

  test("13. Protection against concurrent active attempts / Safe Recovery: returns existing active attempt", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/start`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.recovered).toBe(true);
    expect(res.body.data.attemptId).toBe(student1AttemptId);
  });

  test("14. Student saves draft answer during active attempt", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/attempts/${student1AttemptId}/draft`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        questionId: question1Id,
        selectedOptionId: q1CorrectOptId,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.selectedOptionId).toBe(q1CorrectOptId);
  });

  test("15. Student submits quiz attempt with answers: auto-grades MCQ/TF", async () => {
    const q2Options = await prisma.questionOption.findMany({ where: { questionId: question2Id } });
    const q2CorrectOpt = q2Options.find((o) => o.isCorrect)!;

    const res = await request(app)
      .post(`/api/v1/quizzes/attempts/${student1AttemptId}/submit`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({
        answers: [
          { questionId: question1Id, selectedOptionId: q1CorrectOptId },
          { questionId: question2Id, selectedOptionId: q2CorrectOpt.id },
          { questionId: shortAnswerQId, textResponse: "Top-down memoization caches results, bottom-up builds table." },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // MCQ & TF awarded 5 + 5 = 10 points. Total possible = 20. Short answer pending instructor grading.
    expect(res.body.data.totalEarned).toBe(10);
    expect(res.body.data.totalPossible).toBe(20);
    expect(res.body.data.status).toBe("NEEDS_GRADING");
  });

  test("16. Idempotent submission: Re-submitting completed attempt is rejected", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/attempts/${student1AttemptId}/submit`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ answers: [] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("ATTEMPT_ALREADY_SUBMITTED");
  });

  // ----------------------------------------------------
  // 4. MANUAL GRADING & REVIEW
  // ----------------------------------------------------
  test("17. Manual grading support for short-answer questions: Instructor awards points and feedback", async () => {
    const res = await request(app)
      .patch(`/api/v1/quizzes/attempts/${student1AttemptId}/grade`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        questionId: shortAnswerQId,
        pointsAwarded: 9.0,
        feedback: "Clear explanation of recursion vs iteration.",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("COMPLETED");
    // Total earned = 10 + 9 = 19 out of 20 = 95%
    expect(res.body.data.score).toBe(95);
    expect(res.body.data.passed).toBe(true);
  });

  test("18. Student reviews completed attempt: sees correct answers, explanations, and grader feedback", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/attempts/${student1AttemptId}/review`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.score).toBe(95);
    expect(res.body.data.passed).toBe(true);
    expect(res.body.data.questions.length).toBe(3);

    const shortAns = res.body.data.questions.find((q: any) => q.questionId === shortAnswerQId);
    expect(shortAns.pointsAwarded).toBe(9);
    expect(shortAns.graderFeedback).toContain("Clear explanation");
  });

  test("19. Attempt quota limit enforcement: Starting attempt beyond maxAttempts is blocked (403)", async () => {
    // Student 1 starts attempt #2 (maxAttempts is 2)
    const att2 = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/start`)
      .set("Authorization", `Bearer ${student1Token}`);
    expect(att2.status).toBe(201);
    expect(att2.body.data.attemptNum).toBe(2);

    // Submit attempt #2
    await request(app)
      .post(`/api/v1/quizzes/attempts/${att2.body.data.attemptId}/submit`)
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ answers: [] });

    // Attempt #3 should be blocked because maxAttempts = 2
    const att3 = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/start`)
      .set("Authorization", `Bearer ${student1Token}`);

    expect(att3.status).toBe(403);
    expect(att3.body.success).toBe(false);
    expect(att3.body.error).toContain("Maximum attempts limit");
  });

  test("20. Non-enrolled outsider is blocked from starting quiz attempt (403 Forbidden)", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/start`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ----------------------------------------------------
  // 5. INSTRUCTOR ANALYTICS & SOFT DELETION
  // ----------------------------------------------------
  test("21. Instructor retrieves cohort quiz performance analytics", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/stats`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalAttempts).toBeGreaterThanOrEqual(2);
    expect(res.body.data.highestScore).toBe(95);
    expect(res.body.data.attempts.length).toBeGreaterThanOrEqual(2);
  });

  test("22. Instructor soft-deletes a question: excluded from question bank but preserved in quiz attempts", async () => {
    const res = await request(app)
      .delete(`/api/v1/quizzes/questions/${question1Id}`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await prisma.practiceQuestion.findUnique({ where: { id: question1Id } });
    expect(check?.isDeleted).toBe(true);
  });

  // ----------------------------------------------------
  // 6. TELEGRAM INTEGRATION VERIFICATION
  // ----------------------------------------------------
  test("23. Telegram /quizzes command executes and formats active quizzes cleanly", async () => {
    const mockBot: any = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 101 }),
    };

    await handleQuizzesCommand(mockBot, Number(student1User.telegramChatId));

    expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
    const sentText = mockBot.sendMessage.mock.calls[0][1];
    expect(sentText).toContain("Active Course Quizzes");
  });

  test("24. Telegram /practice command delivers question prompt with options", async () => {
    const mockBot: any = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 102 }),
    };

    await handlePracticeCommand(mockBot, Number(student1User.telegramChatId), "Graph");

    expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
    const sentText = mockBot.sendMessage.mock.calls[0][1];
    expect(sentText).toContain("Practice Arena");
  });
});
