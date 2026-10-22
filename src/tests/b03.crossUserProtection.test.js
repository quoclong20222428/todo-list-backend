/**
 * B03 — Cross-user update and delete protection
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 * This does NOT test Clerk token validation.
 *
 * Documents DEF-1:
 *   deleteTask() calls Task.findOneAndDelete({ _id, userId }) but never
 *   inspects the return value. When no document matches (different userId),
 *   it still returns HTTP 200 { message: "Task deleted" } instead of 404.
 *
 *   The test asserts the OBSERVED (defective) behavior. The task record is
 *   verified to still exist in the database after the no-op delete.
 *   Production code is NOT modified in this batch.
 *
 * Verifies:
 *   - PUT /api/tasks/:id for another user's task → 404 (correct behavior)
 *   - DELETE /api/tasks/:id for another user's task → observed status (DEF-1)
 *   - Task document is unchanged after a cross-user delete attempt
 *   - DELETE for a completely nonexistent task ID → observed status
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

const USER_A = "test-user-a-b03";
const USER_B = "test-user-b-b03";

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

describe("B03 — Cross-user protection (mocked auth)", () => {
  it("PUT another user's task → 404 (correct ownership check in updateTask)", async () => {
    const taskB = await getTask().create({
      title: "User B task",
      description: "belongs to B",
      userId: USER_B,
    });

    const res = await request(app)
      .put(`/api/tasks/${taskB._id}`)
      .set("X-Test-User-Id", USER_A)
      .send({ title: "hijacked" });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");

    // Verify the document was not modified
    const unchanged = await getTask().findById(taskB._id);
    expect(unchanged.title).toBe("User B task");
  });

  /**
   * DEF-1 FIX VERIFIED:
   * deleteTask() now checks the return value of findOneAndDelete().
   * When the query { _id, userId } matches nothing (cross-user attempt),
   * the controller returns 404 { message: "Task not found" }.
   * The target document must remain in the database.
   */
  it("DELETE another user's task → 404 (DEF-1 fixed: ownership enforced)", async () => {
    const taskB = await getTask().create({
      title: "User B delete target",
      description: "belongs to B",
      userId: USER_B,
    });

    const res = await request(app)
      .delete(`/api/tasks/${taskB._id}`)
      .set("X-Test-User-Id", USER_A);

    // DEF-1 fixed: controller now returns 404 when findOneAndDelete matches nothing.
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");

    // Critical safety check: the task must still exist in the database.
    const stillExists = await getTask().findById(taskB._id);
    expect(stillExists).not.toBeNull();
    expect(stillExists.userId).toBe(USER_B);
  });

  it("DELETE nonexistent task ID → 404 (DEF-1 fixed: no match returns 404)", async () => {
    const nonExistentId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .delete(`/api/tasks/${nonExistentId}`)
      .set("X-Test-User-Id", USER_A);

    // DEF-1 fixed: no document matched → 404.
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");
  });

  it("DELETE own task → 200 and document removed (correct path)", async () => {
    const taskA = await getTask().create({
      title: "User A own task",
      description: "owned by A",
      userId: USER_A,
    });

    const res = await request(app)
      .delete(`/api/tasks/${taskA._id}`)
      .set("X-Test-User-Id", USER_A);

    expect(res.status).toBe(200);

    const shouldBeGone = await getTask().findById(taskA._id);
    expect(shouldBeGone).toBeNull();
  });
});
