/**
 * B06 — `this_week` date filter (UTC calendar boundaries)
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * UTC CALENDAR CONTRACT:
 *   The controller uses getUTCDateRange() which computes week boundaries
 *   using UTC methods exclusively (getUTCDay, Date.UTC). Monday is the
 *   start of the ISO week.
 *
 *   Week boundaries are half-open: [Monday 00:00 UTC, next Monday 00:00 UTC)
 *
 * FAKE TIMER STRATEGY:
 *   vi.useFakeTimers() replaces the global Date used by the controller's
 *   `new Date()` inside getUTCDateRange(). However, it also affects MongoDB
 *   driver internals and `Task.collection.insertMany`.
 *
 *   This suite:
 *   1. Seeds all test data with real Date objects BEFORE enabling fake timers.
 *   2. Activates fake timers only around the HTTP GET call.
 *   3. Restores real timers immediately after.
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

const USER = "test-user-b06";

let app;

// Fixed deterministic dates — UTC-based, timezone-independent
// ISO week: Mon 2024-01-08 to Sun 2024-01-14 (UTC calendar)
const MONDAY_JAN_8     = new Date("2024-01-08T10:00:00.000Z");
const WEDNESDAY_JAN_10 = new Date("2024-01-10T10:00:00.000Z");
const SUNDAY_JAN_14    = new Date("2024-01-14T09:00:00.000Z");
// Previous week — clearly before Monday Jan 8 00:00 UTC
const SUNDAY_JAN_7     = new Date("2024-01-07T00:00:00.000Z");
const FRIDAY_JAN_5     = new Date("2024-01-05T10:00:00.000Z");

beforeAll(async () => {
  await connectTestDB();
  app = createTestApp();
});

afterAll(async () => {
  vi.useRealTimers();
  await disconnectTestDB();
});

beforeEach(async () => {
  vi.useRealTimers(); // Ensure real timers between tests
  await clearTasks();
});

describe("B06 — this_week date filter (mocked auth)", () => {
  it("returns tasks created this week and excludes last week's tasks (clock fixed to Wednesday)", async () => {
    // Seed BEFORE enabling fake timers so MongoDB driver is unaffected
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "This Monday",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: MONDAY_JAN_8,
        updatedAt: MONDAY_JAN_8,
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Last Friday",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: FRIDAY_JAN_5,
        updatedAt: FRIDAY_JAN_5,
        completedAt: null,
      },
    ]);

    // Activate fake clock only for the controller call; finally ensures
    // real timers are always restored even if the request or an assertion throws.
    vi.useFakeTimers({ now: WEDNESDAY_JAN_10.getTime() });
    let res;
    try {
      res = await request(app)
        .get("/api/tasks?filter=this_week")
        .set("X-Test-User-Id", USER);
    } finally {
      vi.useRealTimers();
    }

    expect(res.status).toBe(200);
    const titles = res.body.tasks.map((t) => t.title);
    expect(titles).toContain("This Monday");
    expect(titles).not.toContain("Last Friday");
  });

  it("this_week on Sunday correctly includes Mon–Sun tasks of that UTC week", async () => {
    /**
     * UTC week: Mon 2024-01-08 00:00 UTC to Mon 2024-01-15 00:00 UTC
     * Clock fixed to Sunday Jan 14 (getUTCDay()=0 → daysSinceMonday=6)
     * startDate = Date.UTC(2024, 0, 14-6) = Jan 8 00:00 UTC ✓
     * endDate   = Date.UTC(2024, 0, 14-6+7) = Jan 15 00:00 UTC ✓
     */
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Monday of same week",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: MONDAY_JAN_8,
        updatedAt: MONDAY_JAN_8,
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Sunday itself",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: SUNDAY_JAN_14,
        updatedAt: SUNDAY_JAN_14,
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Previous Sunday (last week)",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: SUNDAY_JAN_7,
        updatedAt: SUNDAY_JAN_7,
        completedAt: null,
      },
    ]);

    // Clock fixed to Sunday Jan 14, 2024
    vi.useFakeTimers({ now: SUNDAY_JAN_14.getTime() });
    let res;
    try {
      res = await request(app)
        .get("/api/tasks?filter=this_week")
        .set("X-Test-User-Id", USER);
    } finally {
      vi.useRealTimers();
    }

    expect(res.status).toBe(200);
    const titles = res.body.tasks.map((t) => t.title);

    expect(titles).toContain("Monday of same week");
    expect(titles).toContain("Sunday itself");
    expect(titles).not.toContain("Previous Sunday (last week)");
  });

  it("filter=all_time returns all user tasks regardless of date", async () => {
    // Seed with real timers
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Old task",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: new Date("2020-01-01T00:00:00Z"),
        updatedAt: new Date("2020-01-01T00:00:00Z"),
        completedAt: null,
      },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER);

    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).toContain("Old task");
  });
});
