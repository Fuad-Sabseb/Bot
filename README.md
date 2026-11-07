# Campus Super App — Backend & Telegram Bot Ecosystem
**Phase 1 Foundation: PostgreSQL 16, Prisma ORM, Scoped RBAC, Cryptographic Authentication, and Refactored Telegram Bot Engine**

---

## 1. Executive Overview

The **Campus Super App** transforms an existing standalone Telegram script into a modern, resilient, multi-tiered digital university learning and class management platform.

### Phase 1 Core Capabilities Implemented:
- **Database Engine**: Dedicated PostgreSQL 16 relational database with compiled `pgvector` support, custom XOR owner constraints, and partial unique indexes.
- **Data Preservation**: 100% byte-for-byte SHA-256 backup of original legacy files into `legacy_data/` with an automated, idempotent migration engine.
- **Authentication & Security**: Bcrypt password hashing, short-lived JWT access tokens (15m), and cryptographic refresh token rotation with a 10-second AES-256-GCM encrypted grace window for concurrent browser tab requests.
- **Replay Attack Defense**: Automatic revocation of entire token families and active sessions upon detection of compromised or expired token replay.
- **Scoped RBAC**: Centralized authorization middleware supporting multi-role hierarchies across Global (`ADMIN`, `USER`), Class cohort (`CLASS_REP`, `STUDENT`), and Course offering (`LEAD_INSTRUCTOR`, `INSTRUCTOR`, `TA`, `STUDENT`) boundaries.
- **Refactored Telegram Bot**: Modular architecture with persistent conversation state, exact Campus ID matching, rate-limiting, and server-side administrative access control.

---

## 2. Directory Structure

```
Bot/
├── .env.example                       # Documented environment variable template
├── .gitignore                         # Strict exclusion of secrets and build artifacts
├── jest.config.js                     # Unified test runner configuration
├── package.json                       # Scripts and production/dev dependencies
├── bot.js                             # Original bot entrypoint sanitized of secrets
├── legacy_data/                       # Immutable byte-for-byte legacy backup
│   ├── checksums.json                 # SHA-256 integrity verification manifest
│   ├── campus_id.txt
│   ├── used_ids.txt
│   ├── students.txt
│   └── feedback.txt
├── storage/                           # Persistent local object storage
│   ├── uploads/
│   ├── materials/
│   ├── archives/
│   └── assignments/
│       ├── individual/
│       └── group/
└── backend/
    ├── tsconfig.json                  # Strict TypeScript configuration
    ├── migration-report.json          # Empirical migration reconciliation audit
    ├── prisma/
    │   ├── schema.prisma              # Complete normalized schema definition
    │   └── migrations/
    │       └── 20261106183253_init/   # Versioned PostgreSQL migration with custom SQL
    ├── src/
    │   ├── app.ts                     # Express app setup (Helmet, CORS, CSRF, JSON)
    │   ├── server.ts                  # HTTP & Bot bootstrap coordinator
    │   ├── config/
    │   │   └── env.ts                 # Enforced Zod schema environment validation
    │   ├── database/
    │   │   └── prisma.ts              # Singleton Prisma client
    │   ├── middleware/
    │   │   ├── auth.middleware.ts     # Bearer JWT verification & session loader
    │   │   ├── rbac.middleware.ts     # Global, Class, and Course scope authorization
    │   │   ├── csrf.middleware.ts     # Double-Submit Cookie defense
    │   │   ├── rateLimiter.ts         # IP sliding-window brute-force limiter
    │   │   └── error.middleware.ts    # Centralized error handler with redaction
    │   ├── modules/
    │   │   ├── auth/                  # Authentication routes, controllers, and services
    │   │   └── telegram/              # Refactored modular Telegram Bot engine
    │   │       ├── bot.ts             # Bot lifecycle coordinator
    │   │       ├── state.ts           # Conversation state manager
    │   │       ├── keyboards.ts       # Reusable inline keyboard builders
    │   │       └── handlers/          # Modular command & callback dispatchers
    │   ├── types/
    │   │   └── auth.ts                # TypeScript type augmentations
    │   └── utils/
    │       ├── crypto.ts              # AES-256-GCM & Bcrypt helpers
    │       └── jwt.ts                 # JWT signing and verification
    ├── scripts/
    │   └── migrate-legacy.ts          # Idempotent legacy data importer
    └── tests/
        ├── database.test.ts           # PostgreSQL constraints & partial indexes
        ├── migration.test.ts          # Migration idempotency & reconciliation
        ├── auth.test.ts               # Registration, rotation & replay defense
        ├── rbac.test.ts               # Role enforcement & cross-scope protection
        └── telegram.test.ts           # Bot commands, security & path traversal tests
```

---

## 3. Database Architecture & Setup

### 3.1 Local PostgreSQL 16 Prerequisites
1. **Start PostgreSQL 16 service**:
   ```bash
   brew services start postgresql@16
   ```
2. **Create databases**:
   ```bash
   /opt/homebrew/opt/postgresql@16/bin/createdb -h 127.0.0.1 -p 5432 campus_app
   /opt/homebrew/opt/postgresql@16/bin/createdb -h 127.0.0.1 -p 5432 campus_app_test
   ```
3. **Enable pgvector extension**:
   ```bash
   /opt/homebrew/opt/postgresql@16/bin/psql -h 127.0.0.1 -d campus_app -c "CREATE EXTENSION IF NOT EXISTS vector;"
   /opt/homebrew/opt/postgresql@16/bin/psql -h 127.0.0.1 -d campus_app_test -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```

### 3.2 Applying Migrations
Apply versioned migrations to the active database:
```bash
npm run prisma:migrate
```
To generate the Prisma Client after schema changes:
```bash
npm run prisma:generate
```

### 3.3 Custom PostgreSQL Constraints & Partial Indexes
Custom constraints in `backend/prisma/migrations/20261106183253_init/migration.sql`:
1. `chk_submission_owner_exclusivity`: Enforces XOR ownership on `AssignmentSubmission`. A submission must belong to **either** a student (`studentId IS NOT NULL`) **or** a group (`groupId IS NOT NULL`).
2. `idx_current_individual_submission`: Partial unique index on `("assignmentId", "studentId") WHERE "isCurrentVersion" = TRUE`.
3. `idx_current_group_submission`: Partial unique index on `("assignmentId", "groupId") WHERE "isCurrentVersion" = TRUE`.
4. `idx_single_current_academic_year`: Enforces at most one active year across the institution.
5. `idx_single_current_semester`: Enforces at most one active semester across the institution.
6. Positive numeric checks on marks and group sizes.

---

## 4. Legacy Data Migration & Reconciliation

The migration script (`backend/scripts/migrate-legacy.ts`) parses the original legacy files and executes an idempotent, transactional ingestion into PostgreSQL.

### Execution:
```bash
npm run migrate:legacy
```

### Verified Audit Metrics (`backend/migration-report.json`):
- `campus_id.txt`: 99 raw lines $\rightarrow$ **97 unique IDs** imported (2 duplicates logged: `RU0008/17` at lines 1 & 47; `RU0708/17` at lines 73 & 99).
- `used_ids.txt`: 36 raw lines $\rightarrow$ **34 unique IDs** flagged as `isUsed = true` (1 duplicate logged: `RU0908/17` at lines 1 & 15).
- `students.txt`: 31 unique records verified. All 31 exist in `used_ids.txt`. (3 used IDs absent from `students.txt`: `RU0021/17`, `RU0909/17`, `RU0316/17` — properly reconciled and flagged as used in `CampusIdRegistry`).
- `feedback.txt`: 6 non-empty lines $\rightarrow$ **5 unique feedbacks** imported (1 duplicate logged: `User 5999909651: /start`).

---

## 5. Authentication, Token Rotation & Threat Model

### 5.1 Token Lifecycle
- **Access Tokens**: Signed with `JWT_ACCESS_SECRET`, 15-minute lifespan.
- **Refresh Tokens**: Cryptographically random 48-byte hex tokens, stored in database strictly as SHA-256 hashes with a 7-day expiration.

### 5.2 Concurrent Rotation & 10-Second Grace Cache
To prevent false-positive logouts when multiple browser tabs fire parallel refresh requests:
1. When `/api/v1/auth/refresh` receives token $R_1$, it acquires a PostgreSQL row lock (`SELECT ... FOR UPDATE`) on the `Session`.
2. $R_1$ is marked `isRevoked = true`.
3. A new token pair $(A_2, R_2)$ is minted.
4. The response payload is encrypted with AES-256-GCM using an ephemeral server encryption key and the `sessionId` as Additional Authenticated Data (AAD).
5. The ciphertext is saved in `Session.rotationCiphertext` with `rotationGraceUntil = now() + 10s`.
6. Any parallel request presenting $R_1$ within 10 seconds decrypts and returns $(A_2, R_2)$.

### 5.3 Bounded Replay Threat Model
- If $R_1$ is submitted **after** the 10-second grace window, the server detects a token theft / replay attack.
- The server instantly marks all refresh tokens in that `familyId` as revoked and invalidates the session (`isRevoked = true`), terminating all active connections.

---

## 6. Scoped Role-Based Access Control (RBAC)

Authorization is enforced server-side via `backend/src/middleware/rbac.middleware.ts`:

| Role Scope | Permitted Roles | Enforcement Mechanism |
| :--- | :--- | :--- |
| **Global** | `ADMIN`, `USER` | `requireGlobalRole("ADMIN")` validates institutional administrative privileges. |
| **Class** | `CLASS_REP`, `STUDENT` | `requireClassRole(req => req.params.classId, "CLASS_REP")` checks cohort scope. Global `ADMIN` automatically bypasses class checks. |
| **Course** | `LEAD_INSTRUCTOR`, `INSTRUCTOR`, `TA`, `STUDENT` | `requireCourseRole(req => req.params.offeringId, "INSTRUCTOR")` checks offering scope. |

---

## 7. Telegram Bot Operations

### Security Hardening:
- **Zero Exposed Secrets**: Bot token fallback eliminated from source code. Must be provided via `TELEGRAM_BOT_TOKEN`.
- **Exact Campus ID Matching**: Eliminates the previous substring bug (`"008"` or `"RU"` no longer matches).
- **Authorized Broadcasts**: Announcement callbacks strictly require `ADMIN` privileges verified in PostgreSQL.
- **Path Traversal Protection**: Uploaded files use sanitized base names with UUID prefixes.

### Running the Services:
- Start API Server & Telegram Bot:
  ```bash
  npm run dev
  ```
- Build for Production:
  ```bash
  npm run build
  npm start
  ```

---

## 8. Verification & Test Suite

Run the full automated test suite against the PostgreSQL test database:
```bash
npm test
```

### Test Coverage (92/92 Tests Passing):
1. `database.test.ts` (7 tests): XOR submission checks, active version uniqueness, single current academic year/semester, positive numeric rules.
2. `migration.test.ts` (4 tests): Reconciliation of 97 IDs and 5 feedbacks, second-run idempotency, exact matching, SHA-256 manifest.
3. `auth.test.ts` (7 tests): Registration, duplicate ID prevention, invalid credentials, token rotation, 10-second grace window, replay detection.
4. `rbac.test.ts` (3 tests): Admin access, student access denial, unauthenticated request rejection.
5. `telegram.test.ts` (9 tests): Substring rejection, one-time invite generation, feedback persistence, announcement access denial, real-time admin statistics, safe filename sanitization.
6. `phase2.academic.test.ts` (17 tests): Academic year/semester creation and switching, class cohorts, course catalog, course offerings, instructor assignments, student individual and batch class enrollments, teacher provisioning, class rep promotion, user suspension session revocation, Telegram OTP account-linking, and contextual role-based dashboards (Admin, Teacher, Class Rep, Student).
7. `phase3.assignments.test.ts` (27 tests): Assignment creation with attachments, deadline and cutoff validations, role scoping (Teacher vs Class Rep vs Student), student assignment dashboard with countdowns and status filters, individual submissions with collision-free storage and SHA-256, resubmission versioning (v1 archived, v2 current), personal submission history, group formation and leadership, uniqueness of membership per assignment, group locking upon submission, late submission grace detection, cutoff date rejection, teacher grading with score validation and feedback, automated GRADE_RELEASED notification dispatch, student grade privacy enforcement, notification preferences and in-app/Telegram reminder dispatch, and secure download with path-traversal protection.
8. `phase4.materials.test.ts` (18 tests): Learning material upload with MIME and file-size validation, automatic approval for instructors/admins, pending moderation workflow for students/class reps, course offering and category filtering, full-text keyword search across title/description/tags, ordinary student access restrictions (unapproved materials hidden), instructor moderation queue retrieval, moderation approval with automated enrolled student notifications and Telegram alerts, moderation rejection with reviewer note, atomic download tracking and content disposition, non-enrolled user download denial (403 Forbidden), resource metadata updates, unauthorized modification prevention, soft-deletion (`isDeleted = true`), admin permanent storage purge, and academic resource aggregate metrics.

---

## 9. Phase 2 Endpoints Reference

### User Management (`/api/v1/users`)
- `GET /api/v1/users/me` — Authenticated student/user full profile with enrolled and instructed courses.
- `PATCH /api/v1/users/me` — Update full name, avatar, email, or change password.
- `POST /api/v1/users/telegram/link-token` — Generate a 6-digit OTP token for linking Telegram accounts.
- `POST /api/v1/users/telegram/link` — Link Telegram Chat ID and username using OTP token.
- `GET /api/v1/users` — Admin user management (search, filter by role/class/status, pagination).
- `GET /api/v1/users/:id` — Admin get user profile with all assigned scopes.
- `POST /api/v1/users/teachers` — Admin provision verified teacher account.
- `PATCH /api/v1/users/:id/status` — Admin activate or suspend account (suspension revokes active sessions).
- `POST /api/v1/users/:id/roles/global` — Admin assign/remove global roles (`ADMIN`, `USER`).
- `POST /api/v1/users/:id/roles/class` — Admin assign/remove class roles (`CLASS_REP`, `STUDENT`).
- `POST /api/v1/users/:id/roles/course` — Admin assign/remove course roles (`LEAD_INSTRUCTOR`, `INSTRUCTOR`, `TA`).

### Academic Structure (`/api/v1/academic`)
- `POST /api/v1/academic/years` — Create academic year (Admin).
- `GET /api/v1/academic/years` — List academic years with semesters.
- `PATCH /api/v1/academic/years/:id/set-current` — Set current academic year via atomic transaction.
- `POST /api/v1/academic/semesters` — Create semester (Admin).
- `GET /api/v1/academic/semesters` — List semesters.
- `PATCH /api/v1/academic/semesters/:id/set-current` — Set current semester via atomic transaction.
- `POST /api/v1/academic/classes` — Create class cohort (e.g. `SE-2027`).
- `GET /api/v1/academic/classes` — List class cohorts with student counts and offerings.
- `GET /api/v1/academic/classes/:id` — Class cohort details with students and class reps.
- `POST /api/v1/academic/classes/:id/students` — Assign student to class cohort.
- `POST /api/v1/academic/courses` — Create course catalog entry (`CS301`, credits, title).
- `GET /api/v1/academic/courses` — Search and list course catalog entries.
- `POST /api/v1/academic/offerings` — Create course offering (Course + Semester + Class).
- `GET /api/v1/academic/offerings` — List offerings with filters.
- `GET /api/v1/academic/offerings/:id` — Course offering details, syllabus, instructors, students count.
- `POST /api/v1/academic/offerings/:id/instructors` — Assign instructor to course offering.
- `DELETE /api/v1/academic/offerings/:id/instructors/:id` — Remove instructor from offering.
- `POST /api/v1/academic/offerings/:id/enroll` — Enroll student in course offering.
- `POST /api/v1/academic/offerings/:id/enroll-batch` — Batch enroll all students of the class cohort.
- `DELETE /api/v1/academic/offerings/:id/enroll/:userId?` — Drop student enrollment.
- `GET /api/v1/academic/my-courses` — Authenticated user's enrolled and instructed courses.

### Role-Based Dashboards (`/api/v1/dashboard`)
- `GET /api/v1/dashboard/overview` — Contextual dashboard data dynamically resolving to `ADMIN`, `TEACHER`, `CLASS_REP`, or `STUDENT`.

---

## 10. Phase 3 Endpoints & Features Reference

### Assignment Management (`/api/v1/assignments`)
- `POST /api/v1/assignments` — Create an assignment with optional reference material attachments (Instructor, Class Rep, or Admin).
- `GET /api/v1/assignments/:id` — Get assignment details, instructions, and attachments.
- `PATCH /api/v1/assignments/:id` — Update assignment details, instructions, group sizes, or extend deadlines (automatically re-schedules reminders).
- `DELETE /api/v1/assignments/:id` — Archive assignment.
- `GET /api/v1/assignments/offering/:offeringId` — List active assignments for a course offering.
- `GET /api/v1/assignments/dashboard/student` — Student assignment dashboard with status categories (`UPCOMING`, `SUBMITTED`, `LATE_SUBMITTED`, `OVERDUE`, `GRADED`), deadline countdowns, grades, and teacher feedback.

### Submissions Engine (`/api/v1/assignments/:id/submit`)
- `POST /api/v1/assignments/:id/submit` — Submit or resubmit assignment file (multipart/form-data, max 50MB). Auto-increments version number, marks previous version non-current, validates enrollments, locks group on submission, and enforces deadline/cutoff windows.
- `GET /api/v1/assignments/:id/submissions/my` — Get authenticated student's or student's group submission version history.
- `GET /api/v1/assignments/:id/submissions` — Teacher/Admin view of all student submissions for an assignment.
- `PATCH /api/v1/assignments/:id/submissions/:submissionId/grade` — Grade submission with numeric score and written feedback; automatically dispatches `GRADE_RELEASED` notification to student or group members.
- `GET /api/v1/assignments/files/download?fileKey=...` — Secure file download with permission checks and path traversal protection.

### Assignment Groups (`/api/v1/assignments/:id/groups`)
- `POST /api/v1/assignments/:id/groups` — Create a group for group assignment (creator becomes leader).
- `GET /api/v1/assignments/:id/groups` — List all groups and members for a group assignment.
- `POST /api/v1/assignments/:id/groups/:groupId/join` — Join a group (enforces max group size, uniqueness of group membership per student, and submission lock status).
- `POST /api/v1/assignments/:id/groups/:groupId/leave` — Leave a group before submission.

### Notifications & Preferences (`/api/v1/notifications`)
- `GET /api/v1/notifications` — Paginated user notifications with unread badge count.
- `PATCH /api/v1/notifications/:id/read` — Mark notification as read.
- `PATCH /api/v1/notifications/read-all` — Mark all user notifications as read.
- `GET /api/v1/notifications/preferences` — Get notification preferences (web, Telegram, reminder intervals).
- `PATCH /api/v1/notifications/preferences` — Update notification preferences.

### Automated Deadlines & Reminders Service
- Automated calculation of reminders for `THREE_DAYS`, `ONE_DAY`, and `TWO_HOURS` before due date.
- Cancels pending reminders when student or group successfully submits.
- Periodic batch processor `ReminderService.processDueReminders()` delivers in-app and Telegram notifications.

---

## 11. Phase 4 Endpoints & Features Reference

### Academic Resources & Learning Materials (`/api/v1/materials`)
- `POST /api/v1/materials` — Upload academic resource file (PDF, PPTX, DOCX, TXT/MD/Code, ZIP, images up to 100MB). Instructors and Admins auto-approved; students/class reps placed in `PENDING` moderation.
- `GET /api/v1/materials` — Discover and filter learning materials by `category`, `courseOfferingId`, `courseId`, `academicYearId`, `semesterId`, full-text `search`, and sorted by `newest`, `downloads`, or `title`. Unapproved materials are strictly hidden from ordinary students.
- `GET /api/v1/materials/stats` — Aggregate metrics: total approved resources, total downloads, category distribution, and top 5 most downloaded resources.
- `GET /api/v1/materials/moderation/queue` — Faculty/Admin moderation queue listing pending resources scoped to instructed courses.
- `GET /api/v1/materials/:id` — Detailed resource view with course offering, academic year, semester, and uploader information.
- `PATCH /api/v1/materials/:id` — Update resource metadata (`title`, `description`, `category`, `tags`).
- `DELETE /api/v1/materials/:id` — Soft-delete resource (`isDeleted = true`). Admins may provide `?purge=true` to delete the database record and physically purge the file from disk.
- `GET /api/v1/materials/:id/download` — Securely stream resource file with atomic download count increment. Restricted to enrolled students, assigned instructors, and Admins.
- `PATCH /api/v1/materials/:id/moderate` — Faculty/Admin moderation action (`APPROVED`, `REJECTED`, `ARCHIVED`) with optional reviewer feedback note. Automatically dispatches `MATERIAL_NEW` notifications and Telegram alerts upon approval.

---

## 12. Phase 5 Endpoints & Features Reference

### Previous-Year Examination & Project Archive System (`/api/v1/archive`)
- `POST /api/v1/archive` — Upload an academic archive resource (PDF, PPTX, DOCX, ZIP project archives, Code up to 100MB). Instructors/Admins auto-approved with ability to certify official department answer keys; students and class reps enter `PENDING` moderation queue and cannot self-certify `isOfficial: true`.
- `GET /api/v1/archive` — Search, filter, and paginate academic archive resources. Supports filtering by `courseId`, `courseOfferingId`, `academicYearStr`, `semesterNum`, `examYear`, `resourceType` (`PAST_EXAM`, `PROJECT`, `SOLUTION`, `REFERENCE`), `assessmentType` (`MIDTERM`, `FINAL`, `QUIZ`, `LAB_EXAM`, `GRADUATION_PROJECT`, `TERM_PROJECT`, `ASSIGNMENT`), `isOfficial`, and full-text keyword `search`.
- `GET /api/v1/archive/stats` — Aggregate metrics: total approved archive materials, pending moderation count, official department solutions, total downloads, breakdown by resource/assessment type, and top 5 downloaded resources.
- `GET /api/v1/archive/moderation/queue` — Faculty/Admin moderation queue listing pending student-contributed exams and projects.
- `GET /api/v1/archive/:id` — Retrieve detailed archive item with full course offering, exam year, and uploader attribution.
- `PATCH /api/v1/archive/:id` — Update archive metadata (`title`, `description`, `resourceType`, `assessmentType`, `examYear`, `tags`, `isOfficial`). Enforces that students cannot toggle `isOfficial: true`.
- `DELETE /api/v1/archive/:id` — Soft-delete archive entry (`isDeleted = true`). Admins may provide `?hard=true` to permanently purge database record and physical disk file.
- `GET /api/v1/archive/:id/download` — Stream archive file securely with atomic download counter increment.
- `PATCH /api/v1/archive/:id/moderate` — Faculty/Admin moderation action (`APPROVE`, `REJECT`, `ARCHIVE`) with review note and official certification toggle. Dispatches in-app and Telegram notifications to contributor.

### Telegram Bot Archive Integration
- `/archive <query>` — Search approved archive resources directly from Telegram.
- `/past_exams <course>` — Quick search for past examination papers and solutions.
- `🏛️ Archive & Past Exams` — Main menu interactive button displaying top downloaded resources and search shortcuts.

---

## 13. Phase 6 Endpoints & Features Reference

### Practice Questions & Quizzes System (`/api/v1/quizzes`)

#### Question Bank Management
- `POST /api/v1/quizzes/questions` — Create practice question with prompt, chapter, topic, difficulty (`EASY`, `MEDIUM`, `HARD`), question type (`MULTIPLE_CHOICE`, `TRUE_FALSE`, `SHORT_ANSWER`), options, and pedagogical explanation. Authorized for course instructors and administrators.
- `GET /api/v1/quizzes/questions` — List questions filtered by course offering, topic, chapter, difficulty, and type. Sanitized for students (correct answer keys and explanations omitted).
- `GET /api/v1/quizzes/questions/:id` — Retrieve question details.
- `PATCH /api/v1/quizzes/questions/:id` — Update question prompt, difficulty, or options.
- `DELETE /api/v1/quizzes/questions/:id` — Soft-delete question (`isDeleted = true`) preserving historical attempt records.
- `POST /api/v1/quizzes/questions/:id/practice` — Instant self-testing: evaluates student's answer immediately, returns `isCorrect`, correct option ID, and explanation without consuming quiz quotas.

#### Formal Quiz Configuration
- `POST /api/v1/quizzes` — Create timed quiz configuration (`durationMin`, `passingScore`, `maxAttempts`, `shuffleQuestions`, `shuffleOptions`).
- `GET /api/v1/quizzes` — List course quizzes. Enrolled students see published quizzes and their personal attempt history/best scores; instructors see draft quizzes.
- `GET /api/v1/quizzes/:id` — Get quiz overview and sanitized question roster.
- `PATCH /api/v1/quizzes/:id` — Update quiz settings or toggle `isPublished`. Publishing automatically broadcasts notifications to enrolled students via web and Telegram.
- `POST /api/v1/quizzes/:id/questions` — Add question to quiz with point weight and ordering.
- `DELETE /api/v1/quizzes/:id/questions/:questionId` — Remove question from quiz.
- `GET /api/v1/quizzes/:id/stats` — Instructor cohort performance analytics (total attempts, unique students, pass rate, average score, attempt log).

#### Timed Quiz Attempt & Evaluation Engine
- `POST /api/v1/quizzes/:id/attempts/start` — Start a new timed attempt. Validates attempt quota (`maxAttempts`), provides safe recovery of active in-progress attempts, calculates server expiration, and serves sanitized questions with randomized ordering.
- `POST /api/v1/quizzes/attempts/:attemptId/draft` — Persist draft answers in the background during active attempts.
- `POST /api/v1/quizzes/attempts/:attemptId/submit` — Submit quiz attempt. Server validates timer deadline, auto-grades objective questions (`MULTIPLE_CHOICE`, `TRUE_FALSE`), calculates score and pass/fail, and flags short-answer questions for manual review. Idempotent submission prevents double-submits.
- `PATCH /api/v1/quizzes/attempts/:attemptId/grade` — Instructor manual grading for short-answer questions with points and written feedback.
- `GET /api/v1/quizzes/attempts/:attemptId/review` — Review completed attempt results with question-by-question score breakdown, correct answers, and instructor explanations.

### Telegram Bot Quiz Integration
- `/quizzes` — Lists available published quizzes for the user's enrolled courses with duration, question count, and web links.
- `/practice [topic]` — Delivers an interactive practice question with inline buttons for option selection and instant answer feedback.
- `🎯 Practice & Quizzes` — Interactive main menu button with shortcuts to active quizzes and practice modes.

---

## 14. Phase 7 Endpoints & Features Reference

### Community & Student Blog System (`/api/v1/blog`)

#### Student Blog Publishing & Reading
- `POST /api/v1/blog/posts` — Publish student article, tutorial, or project idea with Markdown content, category, tags, and cover image. Generates unique SEO slug and assigns `PENDING` status for students (auto-approved for administrators).
- `GET /api/v1/blog/posts` — List published articles with category, tag, search, and author filtering, plus sorting (`recent` by creation date, `popular` by view counter). Authors can view their own drafts via `myPosts=true`.
- `GET /api/v1/blog/posts/:slugOrId` — Retrieve article content with formatted Markdown, author attribution, comments thread, view counter increment, like count, and user engagement states.
- `PATCH /api/v1/blog/posts/:id` — Update article title, content, category, tags, or cover image (author or administrator only).
- `DELETE /api/v1/blog/posts/:id` — Soft-delete article (`isDeleted = true`) (author or administrator only).
- `POST /api/v1/blog/upload-cover` — Upload article cover image with strict MIME validation (JPEG, PNG, WEBP, GIF, max 5MB).

#### Social Interactions (Likes, Comments & Bookmarks)
- `POST /api/v1/blog/posts/:id/like` — Toggle like on an article with atomic like count recalculation.
- `POST /api/v1/blog/posts/:id/bookmark` — Toggle bookmark on an article for reading later.
- `GET /api/v1/blog/bookmarks` — Retrieve current user's saved bookmarks.
- `POST /api/v1/blog/posts/:id/comments` — Post constructive comment on an article; automatically triggers in-app and Telegram notifications to the article author.
- `DELETE /api/v1/blog/comments/:commentId` — Delete comment (comment author, article author, or administrator only).

#### Author Profiles & Content Safety
- `GET /api/v1/blog/authors/:authorId` — Author profile with cumulative statistics (total published articles, total views, total likes) and published article portfolio.
- `POST /api/v1/blog/posts/:id/report` — Report inappropriate article with reason and details. Prevents duplicate reports from the same user.
- `POST /api/v1/blog/comments/:commentId/report` — Report inappropriate comment for safety review.
- `GET /api/v1/blog/admin/reports` — Administrator safety queue of pending content reports.
- `PATCH /api/v1/blog/admin/reports/:reportId` — Resolve or dismiss content reports (`action: RESOLVED | DISMISSED`).
- `PATCH /api/v1/blog/admin/posts/:id/moderate` — Administrator moderation action (`APPROVE`, `REJECT`, `ARCHIVE`) with moderation note and author notification. Enforces self-approval defense.

### Telegram Bot Blog Integration
- `/blog [query]` or `/articles [query]` — Discover and search recent academic articles directly from Telegram with inline buttons.
- `blog_read_<id>` callback — Delivers formatted article snippet, author information, view/like counters, and direct Web App reading links.
- `✍️ Student Blog & Ideas` — Main menu interactive button with quick access to student knowledge sharing.

---

## 15. Phase 8 Endpoints & Features Reference

### AI Academic Assistant & Document Intelligence (`/api/v1/ai`)

#### Student Quota & Chat Engine
- `GET /api/v1/ai/quota` — Retrieve student daily and monthly token allowances (default 50,000 daily, 1,000,000 monthly) with automated 24-hour daily consumption reset.
- `GET /api/v1/ai/conversations` — List conversation threads ordered by recent activity with message count and snippet.
- `POST /api/v1/ai/conversations` — Initialize a new conversation thread.
- `GET /api/v1/ai/conversations/:id` — Retrieve full conversation message history with timestamps, role attribution, and source citations. Enforces conversation ownership privacy.
- `DELETE /api/v1/ai/conversations/:id` — Delete conversation thread and associated message history.
- `POST /api/v1/ai/conversations/:id/messages` — Send message in active conversation. Supports specialized modes:
  - `code` — Programming code debugging and algorithmic complexity analysis ($O(N)$ notation).
  - `math` — Mathematical derivations, equations ($$...$$), and step-by-step proofs.
  - `summarize` — Lecture notes executive summaries and key bullet points.
  - `exam_prep` / `study_plan` — Structured revision schedules and timetable milestones.
  - `general` — General academic inquiry.
- `POST /api/v1/ai/ask` — Direct query without creating a persistent conversation thread (ideal for quick questions).

#### RAG Document Chunking & Grounded Answering
- `POST /api/v1/ai/index/:materialId` — Index approved learning materials into `DocumentChunk` records with token counting and pgvector 1536-dimensional embeddings.
- Automatic RAG Grounding — When querying academic concepts or scoping to a course offering, the assistant retrieves matching verified chunks and outputs grounded answers strictly attributed to official documents with `[Source: ...]` citations.

#### Administrator AI Analytics & Quota Control
- `GET /api/v1/ai/admin/analytics` — Institutional AI usage dashboard: total requests, cumulative tokens consumed, active users today, cost estimates, and top consuming students.
- `PATCH /api/v1/ai/admin/quotas/:userId` — Administrator modification of student daily and monthly token quotas.

### Telegram Bot AI Integration
- `/ai <prompt>` or `/ask <prompt>` — 24/7 academic tutoring directly in Telegram with formatted responses, grounded source citations, and daily quota metrics.
- `🤖 AI Assistant` — Interactive main menu button with usage guidance and web deep links.







