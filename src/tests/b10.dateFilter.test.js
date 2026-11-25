/**
 * B10 — Date filter boundary tests (UTC calendar boundaries)
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * UTC CALENDAR CONTRACT:
 *   The controller uses getUTCDateRange() which computes all boundaries
 *   using UTC methods exclusively. All ranges are half-open: [start, end).
 *
 *   - today:      [00:00 UTC today, 00:00 UTC tomorrow)
 *   - this_month: [1st of month 00:00 UTC, 1st of next month 00:00 UTC)
 *
 * FAKE TIMER STRATEGY (same as B06):
 *   1. Seed data with real timers (MongoDB driver unaffected).
 *   2. Enable fake timers only around the HTTP GET call.
 *   3. Restore real timers in a finally block.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import {
  createTestApp,
  connectTestDB,
  disconnectTestDB,
  clearTasks,
} from "./helpers/createTestApp.js";

const getTask = () => mongoose.model("Task");
const USER = "test-user-b10";

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
  vi.useRealTimers(); // ensure real timers between tests
  await clearTasks();
});

// ─── Reference dates ─────────────────────────────────────────────────────────
//
// "Now" is fixed to 2024-03-15 12:00 UTC (Friday, noon).
// Using UTC calendar:
//   filter=today:      [2024-03-15T00:00:00Z, 2024-03-16T00:00:00Z)
//   filter=this_month: [2024-03-01T00:00:00Z, 2024-04-01T00:00:00Z)

const NOW_UTC = new Date("2024-03-15T12:00:00.000Z");

// Today: 2024-03-15T20:00Z is within [Mar 15 00:00 UTC, Mar 16 00:00 UTC)
const TODAY_TASK_CREATED_AT = new Date("2024-03-15T20:00:00.000Z");
// Yesterday: 2024-03-14T00:00Z is before Mar 15 00:00 UTC
const YESTERDAY_CREATED_AT  = new Date("2024-03-14T00:00:00.000Z");

// This month: 2024-03-10 is within [Mar 1, Apr 1) UTC
const THIS_MONTH_TASK_CREATED_AT = new Date("2024-03-10T12:00:00.000Z");
// Last month: 2024-02-15 is before Mar 1 00:00 UTC
const LAST_MONTH_CREATED_AT      = new Date("2024-02-15T00:00:00.000Z");

// ─── tests ──────────────────────────────────────────────────────────────────

describe("B10 — Date filter boundary (mocked auth)", () => {
  it("B10-1: filter=all_time returns tasks of every status regardless of age", async () => {
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Old pending",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: new Date("2020-01-01T00:00:00Z"),
        updatedAt: new Date("2020-01-01T00:00:00Z"),
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Old inprogress",
        description: "d",
        userId: USER,
        status: "inprogress",
        createdAt: new Date("2021-06-15T00:00:00Z"),
        updatedAt: new Date("2021-06-15T00:00:00Z"),
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Old completed",
        description: "d",
        userId: USER,
        status: "completed",
        createdAt: new Date("2022-12-31T00:00:00Z"),
        updatedAt: new Date("2022-12-31T00:00:00Z"),
        completedAt: new Date("2022-12-31T12:00:00Z"),
      },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER);

    expect(res.status).toBe(200);
    const titles = res.body.tasks.map((t) => t.title);
    expect(titles).toContain("Old pending");
    expect(titles).toContain("Old inprogress");
    expect(titles).toContain("Old completed");
  });

  it("B10-2: filter=today includes today's task and excludes yesterday (clock fixed to 2024-03-15 12:00 UTC)", async () => {
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Today task",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: TODAY_TASK_CREATED_AT,
        updatedAt: TODAY_TASK_CREATED_AT,
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Yesterday task",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: YESTERDAY_CREATED_AT,
        updatedAt: YESTERDAY_CREATED_AT,
        completedAt: null,
      },
    ]);

    vi.useFakeTimers({ now: NOW_UTC.getTime() });
    try {
      const res = await request(app)
        .get("/api/tasks?filter=today")
        .set("X-Test-User-Id", USER);

      expect(res.status).toBe(200);
      const titles = res.body.tasks.map((t) => t.title);
      expect(titles).toContain("Today task");
      expect(titles).not.toContain("Yesterday task");
    } finally {
      vi.useRealTimers();
    }
  });

  it("B10-3: filter=this_month excludes a task from the previous month (clock fixed to 2024-03-15)", async () => {
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "This month task",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: THIS_MONTH_TASK_CREATED_AT,
        updatedAt: THIS_MONTH_TASK_CREATED_AT,
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Last month task",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: LAST_MONTH_CREATED_AT,
        updatedAt: LAST_MONTH_CREATED_AT,
        completedAt: null,
      },
    ]);

    vi.useFakeTimers({ now: NOW_UTC.getTime() });
    try {
      const res = await request(app)
        .get("/api/tasks?filter=this_month")
        .set("X-Test-User-Id", USER);

      expect(res.status).toBe(200);
      const titles = res.body.tasks.map((t) => t.title);
      expect(titles).toContain("This month task");
      expect(titles).not.toContain("Last month task");
    } finally {
      vi.useRealTimers();
    }
  });

  it("B10-4: server controls createdAt — client-supplied value in POST body is ignored", async () => {
    const FORGED_CREATED_AT = "2000-01-01T00:00:00.000Z";
    const forgiedMs = new Date(FORGED_CREATED_AT).getTime();

    const before = Date.now();
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({
        title: "CreatedAt forge attempt",
        description: "Server should ignore createdAt in body",
        createdAt: FORGED_CREATED_AT, // ignored by the controller
      });
    const after = Date.now();

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("createdAt");

    const serverCreatedAtMs = new Date(res.body.createdAt).getTime();

    // The server timestamp must fall within the request window
    expect(
      serverCreatedAtMs,
      "createdAt should be >= the timestamp recorded before sending the request"
    ).toBeGreaterThanOrEqual(before);
    expect(
      serverCreatedAtMs,
      "createdAt should be <= the timestamp recorded after receiving the response"
    ).toBeLessThanOrEqual(after);

    // The forged year-2000 value must not have been accepted
    expect(
      serverCreatedAtMs,
      "Server must not have used the forged year-2000 createdAt from the request body"
    ).not.toBe(forgiedMs);
  });
});
