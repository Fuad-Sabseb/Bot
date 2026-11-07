import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { QuizzesController } from "./quizzes.controller";

const router = Router();

router.use(authenticate);

// 1. Practice Question Bank
router.post("/questions", QuizzesController.createQuestion);
router.get("/questions", QuizzesController.listQuestions);
router.get("/questions/:id", QuizzesController.getQuestion);
router.patch("/questions/:id", QuizzesController.updateQuestion);
router.delete("/questions/:id", QuizzesController.deleteQuestion);
router.post("/questions/:id/practice", QuizzesController.practiceCheck);

// 2. Quiz Attempts & Submissions
router.post("/attempts/:attemptId/draft", QuizzesController.saveDraft);
router.post("/attempts/:attemptId/submit", QuizzesController.submitAttempt);
router.get("/attempts/:attemptId/review", QuizzesController.getAttemptReview);
router.patch("/attempts/:attemptId/grade", QuizzesController.manualGrade);

// 3. Quiz Management
router.post("/", QuizzesController.createQuiz);
router.get("/", QuizzesController.listQuizzes);
router.get("/:id", QuizzesController.getQuiz);
router.patch("/:id", QuizzesController.updateQuiz);
router.post("/:id/questions", QuizzesController.addQuestionToQuiz);
router.delete("/:id/questions/:questionId", QuizzesController.removeQuestionFromQuiz);
router.get("/:id/stats", QuizzesController.getQuizStats);
router.post("/:id/attempts/start", QuizzesController.startAttempt);

export default router;
