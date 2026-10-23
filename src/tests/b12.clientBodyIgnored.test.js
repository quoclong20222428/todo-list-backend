/**
 * B12 — Server-side completedAt is not overridable by the client
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * The updateTask controller ignores req.body.completedAt entirely.
 * Completion timestamp logic (from tasksController.js):
 *
 *   if (req.body.status === "completed") {
 *     task.completedAt = new Date();          // server sets its own timestamp
 *   } else if (req.body.status != undefined) {
 *     task.completedAt = null;               // cleared on any other status change
 *   }
 *   // req.body.completedAt is never read
 *
 * TIME TOLERANCE:
 *   The server timestamp is asserted to fall within a [before, after] window
 *   captured around the HTTP call. No exact millisecond match is required.
 *
 * WHAT IS NOT TESTED:
 *   - pending → inprogress completedAt clearing without a client body value
 *     (covered by B08 and B09).
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
const USER = "test-user-b12";

// A clearly distinct past timestamp — client will attempt to supply this
const CLIENT_SUPPLIED_DATE = new Date("2000-01-01T00:00:00.000Z");

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

describe("B12 — Server-side completedAt cannot be overridden by client (mocked auth)", () => {
  it("B12-1: pending → completed with client completedAt in body — server timestamp is used, not the client value", async () => {
    const task = await getTask().create({
      title: "Client body test",
      description: "desc",
      userId: USER,
      status: "pending",
    });

    const before = Date.now();
    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("X-Test-User-Id", USER)
      .send({
        status: "completed",
        // Client attempts to supply a timestamp from year 2000
        completedAt: CLIENT_SUPPLIED_DATE.toISOString(),
      });
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.completedAt).not.toBeNull();

    const serverTimestamp = new Date(res.body.completedAt).getTime();

    // Server timestamp must be close to NOW, not the year-2000 client value
    expect(
      serverTimestamp,
      "completedAt should be >= the time before the request was sent"
    ).toBeGreaterThanOrEqual(before);
    expect(
      serverTimestamp,
      "completedAt should be <= the time after the request completed"
    ).toBeLessThanOrEqual(after);

    // Explicit: client-supplied value was NOT used
    expect(serverTimestamp).not.toBe(CLIENT_SUPPLIED_DATE.getTime());
  });

  it("B12-2: pending → inprogress with client completedAt in body — completedAt is null (server clears it, ignores client value)", async () => {
    /**
     * The controller branch:
     *   else if (req.body.status != undefined) { task.completedAt = null; }
     * Any non-completed status change clears completedAt regardless of
     * whatever completedAt value the client sends.
     */
    const task = await getTask().create({
      title: "Inprogress transition",
      description: "desc",
      userId: USER,
      status: "pending",
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("X-Test-User-Id", USER)
      .send({
        status: "inprogress",
        completedAt: CLIENT_SUPPLIED_DATE.toISOString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("inprogress");
    // Non-completed status → server sets null; client value is ignored
    expect(res.body.completedAt).toBeNull();
  });

  it("B12-3: title-only update with client completedAt in body — existing completedAt is unchanged", async () => {
    /**
     * When req.body.status is undefined, neither branch of the completedAt
     * logic executes. The existing completedAt on the document is preserved.
     * Client-supplied completedAt in the body is still ignored.
     */
    const knownDate = new Date("2024-05-10T08:00:00.000Z");
    const task = await getTask().create({
      title: "Editable task",
      description: "desc",
      userId: USER,
      status: "completed",
      completedAt: knownDate,
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("X-Test-User-Id", USER)
      .send({
        title: "New title",
        // Client attempts to replace the stored completedAt
        completedAt: CLIENT_SUPPLIED_DATE.toISOString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New title");

    // completedAt must remain the original value, not the client-supplied one
    const returnedMs = new Date(res.body.completedAt).getTime();
    expect(returnedMs).toBe(knownDate.getTime());
    expect(returnedMs).not.toBe(CLIENT_SUPPLIED_DATE.getTime());
  });
});
