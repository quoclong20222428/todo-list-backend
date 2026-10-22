/**
 * B07 — Status count accuracy
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * Verifies that pendingCount, inProgressCount, completedCount in the
 * GET /api/tasks response exactly match the seeded distribution for the
 * authenticated user and are not inflated by another user's tasks.
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

const getTask = () => mongoose.model("Task");

const USER_A = "test-user-a-b07";
const USER_B = "test-user-b-b07";

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

describe("B07 — Status count accuracy (mocked auth)", () => {
  it("exact counts match seeded distribution (2 pending, 1 inprogress, 3 completed)", async () => {
    await getTask().create([
      { title: "p1", description: "d", userId: USER_A, status: "pending" },
      { title: "p2", description: "d", userId: USER_A, status: "pending" },
      { title: "ip1", description: "d", userId: USER_A, status: "inprogress" },
      { title: "c1", description: "d", userId: USER_A, status: "completed" },
      { title: "c2", description: "d", userId: USER_A, status: "completed" },
      { title: "c3", description: "d", userId: USER_A, status: "completed" },
      // User B — must not affect User A's counts
      { title: "b-p", description: "d", userId: USER_B, status: "pending" },
      { title: "b-p2", description: "d", userId: USER_B, status: "pending" },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER_A);

    expect(res.status).toBe(200);
    expect(res.body.pendingCount).toBe(2);
    expect(res.body.inProgressCount).toBe(1);
    expect(res.body.completedCount).toBe(3);
  });

  it("zero counts when user has no tasks", async () => {
    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER_A);

    expect(res.status).toBe(200);
    expect(res.body.pendingCount).toBe(0);
    expect(res.body.inProgressCount).toBe(0);
    expect(res.body.completedCount).toBe(0);
  });

  it("task list length equals sum of status counts", async () => {
    await getTask().create([
      { title: "t1", description: "d", userId: USER_A, status: "pending" },
      { title: "t2", description: "d", userId: USER_A, status: "inprogress" },
      { title: "t3", description: "d", userId: USER_A, status: "completed" },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER_A);

    expect(res.status).toBe(200);
    const { tasks, pendingCount, inProgressCount, completedCount } = res.body;
    expect(tasks.length).toBe(pendingCount + inProgressCount + completedCount);
  });
});
