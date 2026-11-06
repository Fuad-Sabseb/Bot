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

### Test Coverage (30/30 Tests Passing):
1. `database.test.ts` (7 tests): XOR submission checks, active version uniqueness, single current academic year/semester, positive numeric rules.
2. `migration.test.ts` (4 tests): Reconciliation of 97 IDs and 5 feedbacks, second-run idempotency, exact matching, SHA-256 manifest.
3. `auth.test.ts` (7 tests): Registration, duplicate ID prevention, invalid credentials, token rotation, 10-second grace window, replay detection.
4. `rbac.test.ts` (3 tests): Admin access, student access denial, unauthenticated request rejection.
5. `telegram.test.ts` (9 tests): Substring rejection, one-time invite generation, feedback persistence, announcement access denial, real-time admin statistics, safe filename sanitization.
