/**
 * B08 — completedAt transition behavior
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * UQ-1 RESOLVED (approved 2026-10-21):
 *   When a task transitions to "completed", the backend sets completedAt to
 *   the current server timestamp.
 *   When a task transitions FROM "completed" to any other status, the backend
 *   clears completedAt to null.
 *   Client-supplied completedAt values are never read from req.body.
 *
 * Verifies:
 *   - pending → completed: completedAt is populated with a server timestamp
 *   - completed → pending: completedAt is cleared to null (UQ-1 implemented)
 *   - Title-only update: completedAt is NOT cleared (no status change)
 *   - inprogress → completed: completedAt is set
 *   - completed → inprogress: completedAt is cleared to null
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

const USER = "test-user-b08";

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

describe("B08 — completedAt transition behavior (mocked auth)", () => {
  it("pending → completed: completedAt is set to a server timestamp", async () => {
    const task = await getTask().create({
      title: "Will be completed",
      description: "desc",
      userId: USER,
      status: "pending",
    });

    const before = Date.now();
    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("X-Test-User-Id", USER)
      .send({ status: "completed" });
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.completedAt).not.toBeNull();

    const completedAtMs = new Date(res.body.completedAt).getTime();
    expect(completedAtMs).toBeGreaterThanOrEqual(before);
    expect(completedAtMs).toBeLessThanOrEqual(after);

    // Verify persisted
    const doc = await getTask().findById(task._id);
    expect(doc.completedAt).not.toBeNull();
  });

  it("completed → pending: completedAt is cleared to null (UQ-1 implemented)", async () => {
    const task = await getTask().create({
      title: "Will be un-completed",
      description: "desc",
      userId: USER,
      status: "pending",
    });

    // Step 1: complete the task
    await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("X-Test-User-Id", USER)
      .send({ status: "completed" });

    // Step 2: revert to pending
    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("X-Test-User-Id", USER)
      .send({ status: "pending" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");

    // UQ-1 implemented: completedAt is cleared when un-completing.
    expect(res.body.completedAt).toBeNull();

    const doc = await getTask().findById(task._id);
    expect(doc.status).toBe("pending");
    expect(doc.completedAt).toBeNull();
  });

  it("completed → inprogress: completedAt is cleared to null", async () => {
    const task = await getTask().create({
      title: "Back to inprogress",
      description: "desc",
      userId: USER,
      status: "pending",
    });

    // Complete it first
    await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("X-Test-User-Id", USER)
      .send({ status: "completed" });

    // Then move to inprogress
    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("X-Test-User-Id", USER)
      .send({ status: "inprogress" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("inprogress");
    expect(res.body.completedAt).toBeNull();

    const doc = await getTask().findById(task._id);
    expect(doc.completedAt).toBeNull();
  });

  it("setting only title does not affect completedAt", async () => {
    const task = await getTask().create({
      title: "Editable",
      description: "desc",
      userId: USER,
      status: "completed",
      completedAt: new Date("2024-06-01T00:00:00Z"),
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("X-Test-User-Id", USER)
      .send({ title: "New title" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New title");
    // No status change — completedAt must remain untouched
    expect(new Date(res.body.completedAt).toISOString()).toBe(
      "2024-06-01T00:00:00.000Z"
    );

    const doc = await getTask().findById(task._id);
    expect(doc.completedAt).not.toBeNull();
  });
});
