# Backend Testing Guide

## Prerequisites

| Requirement | Minimum version |
|-------------|-----------------|
| Node.js | 18 LTS or later (tested on v22) |
| npm | 8 or later |

No global packages are required. All test tooling is installed locally as `devDependencies`.

## Install dependencies

Run this once from the backend project directory before the first test run,
and again after any change to `package.json`:

```powershell
cd todo-list-backend
npm install
```

> [!NOTE]
> `node_modules/` is git-ignored. Each developer must run `npm install` after
> cloning or pulling dependency changes.

---

## Running tests

All commands below must be run from the **backend project directory**
(`todo-list-backend/`).

### Run the complete test suite

```powershell
npm test
```

Equivalent to `vitest run`. Executes all 15 test suites (B01–B15) once and
exits with a non-zero code if any test fails.

### Run an individual test file

```powershell
npx vitest run src/tests/b09.crudLifecycle.test.js
```

Replace the path with any test file from `src/tests/`. The global setup
(`globalSetup.js`) runs automatically, so the in-memory MongoDB server is
started even for a single-file run.

### Watch mode (re-runs on file save)

```powershell
npm run test:watch
```

Equivalent to `vitest` (interactive watch). Vitest re-runs affected tests
whenever a source or test file changes. Press `q` to quit.

### Reserved for Phase 3 — Coverage reporting

> `npm run test:coverage` is **not yet implemented**. Coverage configuration
> will be added in a future phase without changing test assertions.

---

## Test database setup and cleanup

The test suite uses [`mongodb-memory-server`](https://github.com/nodkz/mongodb-memory-server)
to run an isolated, in-process MongoDB instance. No external database is
required, and no connection to MongoDB Atlas or any production database is
ever made.

### Lifecycle

| Step | What happens |
|------|-------------|
| `globalSetup.js` (once per run) | Starts `MongoMemoryServer`, writes its URI to `TEST_MONGO_URI` env var, sets fake Clerk keys. |
| `setup.js` (once per worker) | Reads `TEST_MONGO_URI`, validates it is not an Atlas URL, and sets `DB_URL`. Throws immediately if either check fails. |
| `connectTestDB()` (each suite `beforeAll`) | Opens a Mongoose connection to the in-memory server. Skipped if already connected. |
| `clearTasks()` (each suite `beforeEach`) | Deletes all `Task` documents to isolate tests. Does not close the connection. |
| `disconnectTestDB()` (each suite `afterAll`) | Closes the Mongoose connection after the suite finishes. |
| `globalSetup teardown` (once per run) | Stops the in-memory MongoDB server and releases its port. |

All 15 suites run **sequentially in a single process** (`fileParallelism: false`,
`sequence.concurrent: false`), so they safely share one `MongoMemoryServer`
instance and one Mongoose connection without race conditions.

### Safety guards

`setup.js` and `createTestApp.js` both abort with a clear error message when:

- `TEST_MONGO_URI` is not set (indicates `globalSetup.js` failed).
- The URI contains `mongodb.net` or `atlas` (would connect to a real database).

These checks make it impossible to run any test against a production database,
even if environment variables are accidentally misconfigured.

---

## Authentication mocking strategy

The backend uses [Clerk](https://clerk.com/) for authentication in production.
Tests bypass real Clerk JWT validation using two approaches:

| Suite | Approach |
|-------|----------|
| **B01** | Builds its own minimal Express app with an inline `mockRequireAuth()` middleware that rejects requests without an `Authorization` header (→ 401). Tests the route-wiring contract, not Clerk SDK behaviour. |
| **B02–B15** | Uses `createTestApp()` from `src/tests/helpers/createTestApp.js`, which mounts a `testAuthMiddleware`. This middleware reads the `X-Test-User-Id` request header and injects `req.auth.userId`. Requests without the header receive 401. |

**How to pass the auth header in Supertest:**

```js
// Set the authenticated user for the request
await request(app)
  .get('/api/tasks?filter=all_time')
  .set('X-Test-User-Id', 'your-test-user-id');
```

> [!IMPORTANT]
> These tests do **not** verify Clerk token signatures, JWT expiry, or account
> validity. They test business logic, database queries, and HTTP response
> contracts under a known, controlled identity.

---

## Environment variables

No `.env` file is needed to run tests. All environment variables are injected
programmatically by `globalSetup.js` and `setup.js`:

| Variable | Set by | Value during tests |
|----------|--------|--------------------|
| `TEST_MONGO_URI` | `globalSetup.js` | `mongodb://127.0.0.1:<random-port>/` (in-memory) |
| `DB_URL` | `setup.js` | Same as `TEST_MONGO_URI` |
| `VERCEL` | `globalSetup.js` / `setup.js` | `"1"` — suppresses the production HTTP listener |
| `CLERK_SECRET_KEY` | `globalSetup.js` | `sk_test_ISOLATED_FAKE_KEY_DO_NOT_USE_IN_PRODUCTION` |
| `CLERK_PUBLISHABLE_KEY` | `globalSetup.js` | `pk_test_ISOLATED_FAKE_KEY_DO_NOT_USE_IN_PRODUCTION` |

> [!CAUTION]
> The `.env` file contains real Atlas credentials and real Clerk keys for the
> development server. It is git-ignored and must **never** be loaded during
> test runs. `setup.js` explicitly blocks any URI containing `mongodb.net` or
> `atlas`, providing a hard safety net.

---

## Test configuration reference

Configuration lives in [`vitest.config.js`](./vitest.config.js):

| Setting | Value | Reason |
|---------|-------|--------|
| `environment` | `"node"` | No browser APIs needed for backend tests |
| `globalSetup` | `src/tests/globalSetup.js` | Starts MongoMemoryServer before any worker |
| `setupFiles` | `src/tests/setup.js` | Validates and exports DB_URL to each worker |
| `isolate` | `false` | All suites share one module registry — prevents `OverwriteModelError` from Mongoose's model cache |
| `pool` | `"forks"` | Default process-based pool |
| `fileParallelism` | `false` | Sequential file execution prevents clearTasks() races |
| `sequence.concurrent` | `false` | Sequential test execution within a fork |

---

## Common issues and troubleshooting

### `TEST_MONGO_URI is not set`

`globalSetup.js` failed to start `mongodb-memory-server`. Common causes:

- Missing `node_modules` — run `npm install`.
- Incompatible Node.js version — use Node 18+.
- Port conflict — usually resolves on retry.

### `TEST_MONGO_URI appears to point to a remote/Atlas instance`

A real `DB_URL` or `TEST_MONGO_URI` leaked into the environment before the
test run started. Unset the variable and re-run:

```powershell
$env:DB_URL = $null
$env:TEST_MONGO_URI = $null
npm test
```

### `OverwriteModelError: Cannot overwrite Task model once compiled`

Caused by running with `isolate: true` or in parallel. The existing
`vitest.config.js` already sets `isolate: false` and `fileParallelism: false`
to prevent this. Do not override these settings.

### Vitest exits with code 1 but all tests appear to pass

Check for unhandled promise rejections or worker crashes above the summary
line. The CastError stack traces printed by B14 are **expected** and do not
indicate test failures — they come from the controller's own error logging.

### Test hangs and does not exit

An open Mongoose connection was not closed. Ensure every test suite that calls
`connectTestDB()` in `beforeAll` also calls `disconnectTestDB()` in `afterAll`.

### Running a single test suite on Windows (PowerShell)

```powershell
npx vitest run src/tests/b03.crossUserProtection.test.js
```

Avoid passing the path with backslashes inside quotes — Vitest's glob matcher
expects forward slashes.
