/**
 * B14 — Backend error paths: DELETE with malformed ObjectId, GET with invalid/empty filter
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * SCOPE:
 *   B14-1: DELETE /api/tasks/:id with a malformed (non-ObjectId) id string.
 *     The deleteTask controller's catch block returns HTTP 500 (not 400),
 *     unlike updateTask which returns 400. This test documents the OBSERVED
 *     behavior. No production code is modified in this batch.
 *
 *   B14-2: GET /api/tasks?filter=invalid_value
 *     The switch statement default branch sets startDate = null, which causes
 *     the query to behave identically to all_time. This test asserts the
 *     observed behavior (200 with all tasks) and acts as a regression guard:
 *     if the default branch is removed, the controller would likely 500.
 *
 *   B14-3: GET /api/tasks?filter= (empty string)
 *     An empty filter string falls through to the default branch.
 *     Asserts 200 and all tasks returned.
 *
 *   B14-3 (no param): GET /api/tasks with no filter query param.
 *     The controller defaults to filter = "today". This test verifies that
 *     tasks created today are returned and tasks created yesterday are not.
 *
 * DEFECT NOTE (B14-1):
 *   deleteTask catch block: res.status(500).json({ message: error.message })
 *   updateTask catch block: res.status(400).json({ message: error.message })
 *   The inconsistency means a malformed DELETE ID returns 500 rather than 400.
 *   This is documented here; correction requires a separate approved change.
 *
 * DO NOT interpret the status assertions in B14-1 as the desired contract.
 * They document current behavior to baseline for a future fix.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import {
  createTestApp,
  connectTestDB,
  disconnectTestDB,
  clearTasks,
} from "./helpers/createTestApp.js";

const getTask = () => mongoose.model("Task");
const USER = "test-user-b14";

let app;

beforeAll(async () => {
  await connectTestDB();
  app = createTestApp();
});

afterAll(async () => {
  vi.useRealTimers();
  await disconnectTestDB();
});

beforeEach(async () => {
  vi.useRealTimers(); // guarantee real timers between tests
  await clearTasks();
});

// ─── B14-1: DELETE with malformed ObjectId ───────────────────────────────────

describe("B14-1 — DELETE with malformed ObjectId (mocked auth)", () => {
  it("DELETE /api/tasks/not-a-valid-objectid → 500 (deleteTask catch block, inconsistent with PUT's 400)", async () => {
    /**
     * OBSERVED BEHAVIOR:
     *   deleteTask's catch block returns HTTP 500. updateTask's catch block
     *   returns HTTP 400 for the same CastError. This inconsistency is a
     *   known defect documented here without fixing production code.
     *
     * The assertion targets the CURRENT behavior so future changes to align
     * this to 400 (consistent with updateTask) will cause this test to fail
     * and prompt deliberate review.
     *
     * Verified: deleteTask catch: res.status(500).json({ message: error.message })
     * The CastError thrown by findOneAndDelete flows into the catch block.
     */
    const res = await request(app)
      .delete("/api/tasks/not-a-valid-objectid")
      .set("X-Test-User-Id", USER);

    // Exact status: 500. If production is later aligned to 400, update this.
    expect(res.status).toBe(500);

    // The message must be a non-empty string describing the cast failure.
    // Mongoose CastError message: 'Cast to ObjectId failed for value "..."'
    expect(res.body).toHaveProperty("message");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/Cast to ObjectId failed/);
  });

  it("DELETE with malformed ObjectId does not delete any existing task", async () => {
    // Seed a real task for the authenticated user
    const task = await getTask().create({
      title: "Should survive",
      description: "desc",
      userId: USER,
      status: "pending",
    });

    // Attempt to delete with a malformed ID — the cast error fires before any
    // query executes, so the real task must remain untouched.
    await request(app)
      .delete("/api/tasks/not-a-valid-objectid")
      .set("X-Test-User-Id", USER);

    const stillExists = await getTask().findById(task._id);
    expect(stillExists).not.toBeNull();
    expect(stillExists.title).toBe("Should survive");
  });
});

// ─── B14-2: GET with an invalid filter value ──────────────────────────────────

describe("B14-2 — GET with invalid filter value (mocked auth)", () => {
  it("filter=invalid_value → 200 with all user tasks (default branch acts as all_time)", async () => {
    /**
     * REGRESSION GUARD:
     *   The controller's switch default sets startDate = null, treating the
     *   request identically to all_time. If the default branch is removed,
     *   the controller would 500 or return 0 tasks. This test will catch that.
     *
     * Two deterministic tasks are seeded (pending + completed). The response
     * must contain exactly those two tasks and the correct status counts.
     */
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Task X",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: new Date("2024-06-01T10:00:00.000Z"),
        updatedAt: new Date("2024-06-01T10:00:00.000Z"),
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Task Y",
        description: "d",
        userId: USER,
        status: "completed",
        createdAt: new Date("2024-06-01T08:00:00.000Z"),
        updatedAt: new Date("2024-06-01T08:00:00.000Z"),
        completedAt: new Date("2024-06-01T09:00:00.000Z"),
      },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=invalid_value")
      .set("X-Test-User-Id", USER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);

    // Default branch returns all tasks — exactly the two seeded tasks.
    // Sorted newest-first (createdAt: -1): Task X (10:00) before Task Y (08:00).
    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.tasks[0].title).toBe("Task X");
    expect(res.body.tasks[1].title).toBe("Task Y");

    // Status counts must reflect the seeded data exactly.
    expect(res.body.pendingCount).toBe(1);
    expect(res.body.inProgressCount).toBe(0);
    expect(res.body.completedCount).toBe(1);
  });

  it("filter=completely_unknown → 200 with the single seeded task and correct counts", async () => {
    /**
     * A second unknown-filter value exercises the same default branch.
     * One task with status 'inprogress' is seeded; exact content is asserted.
     */
    await getTask().create({
      title: "Present task",
      description: "d",
      userId: USER,
      status: "inprogress",
    });

    const res = await request(app)
      .get("/api/tasks?filter=completely_unknown")
      .set("X-Test-User-Id", USER);

    expect(res.status).toBe(200);
    // Exactly one task — weak length > 0 replaced with exact assertion.
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe("Present task");
    expect(res.body.tasks[0].status).toBe("inprogress");

    expect(res.body.pendingCount).toBe(0);
    expect(res.body.inProgressCount).toBe(1);
    expect(res.body.completedCount).toBe(0);
  });
});

// ─── B14-3: GET with empty filter string ─────────────────────────────────────

describe("B14-3 — GET with empty filter string (mocked auth)", () => {
  it("filter= (empty string) → 200 with all user tasks, exact count and title", async () => {
    /**
     * An empty string does not match any case in the switch statement.
     * The default branch fires, setting startDate = null → all_time behavior.
     */
    await getTask().create([
      { title: "Alpha", description: "d", userId: USER, status: "pending" },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=")
      .set("X-Test-User-Id", USER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    // Exactly the one seeded task — stronger than toContain.
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe("Alpha");
    expect(res.body.pendingCount).toBe(1);
    expect(res.body.inProgressCount).toBe(0);
    expect(res.body.completedCount).toBe(0);
  });

  it("no filter query param → 200 with today's tasks; yesterday's task is excluded", async () => {
    /**
     * The controller defaults to filter = "today" when no query param is given:
     *   const { filter = "today" } = req.query;
     * startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
     *   — uses LOCAL time (UTC+7 on this machine).
     *
     * Fake-timer strategy (same as B15-3):
     *   NOW_UTC = 2024-03-15T07:00:00Z → local 2024-03-15T14:00:00+07:00
     *   startDate (local midnight) = 2024-03-15T00:00:00+07:00
     *                              = 2024-03-14T17:00:00.000Z
     *
     * "Today" task  : 2024-03-14T18:00:00Z (local 01:00+07 on Mar 15) → included.
     * "Yesterday" task: 2024-03-14T10:00:00Z (local 17:00+07 on Mar 14) → excluded.
     *
     * Tasks are seeded with real timers (insertMany with explicit createdAt),
     * then fake timers wrap only the HTTP GET call.
     */
    const NOW_UTC       = new Date("2024-03-15T07:00:00.000Z");
    const TODAY_TS      = new Date("2024-03-14T18:00:00.000Z"); // local Mar 15 01:00+07
    const YESTERDAY_TS  = new Date("2024-03-14T10:00:00.000Z"); // local Mar 14 17:00+07

    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Today task",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: TODAY_TS,
        updatedAt: TODAY_TS,
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Yesterday task",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: YESTERDAY_TS,
        updatedAt: YESTERDAY_TS,
        completedAt: null,
      },
    ]);

    vi.useFakeTimers({ now: NOW_UTC.getTime() });
    let res;
    try {
      res = await request(app)
        .get("/api/tasks")
        .set("X-Test-User-Id", USER);
    } finally {
      vi.useRealTimers();
    }

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);

    // Only "Today task" falls within today's local date window.
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe("Today task");

    // "Yesterday task" must NOT appear in the response.
    const titles = res.body.tasks.map((t) => t.title);
    expect(titles).not.toContain("Yesterday task");

    expect(res.body.pendingCount).toBe(1);
    expect(res.body.inProgressCount).toBe(0);
    expect(res.body.completedCount).toBe(0);
  });
});
