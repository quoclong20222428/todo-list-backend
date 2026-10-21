/**
 * B02 — User isolation when listing tasks
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 * This does NOT test Clerk token validation.
 *
 * Verifies:
 *   - GET /api/tasks returns only tasks belonging to the authenticated user.
 *   - pendingCount, inProgressCount, completedCount reflect only that user's tasks.
 *   - Another user's tasks are not included in either the task list or the counts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import {
  createTestApp,
  connectTestDB,
  disconnectTestDB,
  clearTasks,
} from "./helpers/createTestApp.js";

// Retrieved after routes have registered the model
const getTask = () => mongoose.model("Task");

const USER_A = "test-user-a-b02";
const USER_B = "test-user-b-b02";

let app;

beforeAll(async () => {
  await connectTestDB();
  app = createTestApp();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTasks();
});

describe("B02 — User isolation (mocked auth)", () => {
  it("returns only the authenticated user's tasks", async () => {
    await getTask().create([
      { title: "A-Task-1", description: "desc", userId: USER_A, status: "pending" },
      { title: "A-Task-2", description: "desc", userId: USER_A, status: "completed" },
      { title: "B-Task-1", description: "desc", userId: USER_B, status: "pending" },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER_A);

    expect(res.status).toBe(200);
    const { tasks } = res.body;
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks).toHaveLength(2);

    for (const task of tasks) {
      expect(task.userId).toBe(USER_A);
    }

    const returnedTitles = tasks.map((t) => t.title);
    expect(returnedTitles).toContain("A-Task-1");
    expect(returnedTitles).toContain("A-Task-2");
    expect(returnedTitles).not.toContain("B-Task-1");
  });

  it("status counts reflect only the authenticated user's tasks", async () => {
    await getTask().create([
      { title: "A-pending", description: "d", userId: USER_A, status: "pending" },
      { title: "A-inprogress", description: "d", userId: USER_A, status: "inprogress" },
      { title: "A-completed", description: "d", userId: USER_A, status: "completed" },
      // User B's tasks — should NOT appear in User A's counts
      { title: "B-pending", description: "d", userId: USER_B, status: "pending" },
      { title: "B-pending-2", description: "d", userId: USER_B, status: "pending" },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER_A);

    expect(res.status).toBe(200);
    expect(res.body.pendingCount).toBe(1);
    expect(res.body.inProgressCount).toBe(1);
    expect(res.body.completedCount).toBe(1);
  });

  it("returns empty tasks and zero counts when user has no tasks", async () => {
    // Only seed tasks for USER_B
    await getTask().create([
      { title: "B-only", description: "d", userId: USER_B, status: "pending" },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER_A);

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(0);
    expect(res.body.pendingCount).toBe(0);
    expect(res.body.inProgressCount).toBe(0);
    expect(res.body.completedCount).toBe(0);
  });
});
