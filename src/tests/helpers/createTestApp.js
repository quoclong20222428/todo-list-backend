/**
 * createTestApp.js — Test Express app factory for B02–B08.
 *
 * IMPORTANT: This module does NOT import server.js and does NOT call the
 * production connectDB(). It builds its own minimal Express app with:
 *   - The real route handlers (tasksRouter, healthRouter)
 *   - A test-only auth middleware that reads `X-Test-User-Id` header and
 *     injects req.auth.userId — replacing @clerk/express requireAuth().
 *
 * Authentication disclaimer:
 *   Tests using this factory exercise database queries, business logic, and
 *   HTTP response contracts. They do NOT verify Clerk's actual token
 *   validation. B01 (auth enforcement) uses a separate setup with the real
 *   requireAuth() middleware.
 *
 * Database lifecycle:
 *   The caller is responsible for connecting and disconnecting Mongoose.
 *   Use the helpers exported at the bottom of this file.
 *   With singleFork:true all suites share one Mongoose connection — connect
 *   once in the first suite's beforeAll, and only disconnect in the last
 *   suite's afterAll. Each suite clears its own data in beforeEach/afterEach.
 */

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import taskRouters from "../../routes/tasksRouter.js";
import healthRouter from "../../routes/health.js";

/**
 * Middleware that reads X-Test-User-Id and injects req.auth.
 * Returns 401 when the header is absent, mirroring the real middleware's
 * shape (but NOT validating any JWT).
 */
function testAuthMiddleware(req, res, next) {
  const userId = req.headers["x-test-user-id"];
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  req.auth = { userId };
  next();
}

/**
 * Returns an Express app with mocked authentication.
 * No listener is started; use Supertest to send requests in-process.
 */
export function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cors());

  app.get("/", (_req, res) => res.send("test API"));
  app.use("/health", healthRouter);

  // Mount task routes with the TEST-ONLY auth middleware.
  app.use("/api/tasks", testAuthMiddleware, taskRouters);

  return app;
}

/**
 * Connect Mongoose to the in-memory URI set by globalSetup/setup.
 * Verifies that the URI is the memory server (not a real Atlas cluster).
 * Safe to call multiple times — skips if already connected.
 */
export async function connectTestDB() {
  const uri = process.env.DB_URL;
  if (!uri) throw new Error("[createTestApp] DB_URL is not set.");
  if (uri.includes("mongodb.net") || uri.includes("atlas")) {
    throw new Error("[createTestApp] DB_URL points to a remote instance. Refusing.");
  }
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
}

/**
 * Disconnect Mongoose.
 * Call in the final afterAll() to prevent connection leaks.
 * Individual suites should call clearTasks() instead to preserve
 * the shared connection between suites.
 */
export async function disconnectTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/**
 * Delete all Task documents for test isolation between tests.
 * Does NOT close the connection.
 * Uses mongoose.model() to retrieve the already-registered model rather than
 * importing it again (avoids OverwriteModelError in singleFork mode).
 */
export async function clearTasks() {
  const Task = mongoose.model("Task");
  await Task.deleteMany({});
}
