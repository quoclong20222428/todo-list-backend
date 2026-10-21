/**
 * B06 — `this_week` date filter
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * DEF-2 CORRECTED ASSESSMENT:
 *   The audit claimed the formula `now.getDate() - (now.getDay() - 1) - (now.getDay() === 0 ? 7 : 0)`
 *   produces a negative date on Sunday. Algebraic verification:
 *
 *   On Sunday (getDay() = 0):
 *     mondayDate = now.getDate() - (0 - 1) - 7
 *               = now.getDate() + 1 - 7
 *               = now.getDate() - 6
 *
 *   Sunday Feb 4 (date=4): mondayDate = -2
 *     new Date(2024, 1, -2) → JS rolls back: Jan 29, 2024 ✓ (Mon of that ISO week)
 *   Sunday Jan 14 (date=14): mondayDate = 8
 *     new Date(2024, 0, 8) → Jan 8, 2024 ✓ (Mon of that ISO week)
 *
 *   JS Date handles negative day-of-month by rolling back to the previous month.
 *   The formula is CORRECT for all tested Sundays. DEF-2 is NOT reproduced.
 *
 * FAKE TIMER STRATEGY:
 *   vi.useFakeTimers() replaces the global Date used by the controller's `new Date()`.
 *   However, it also affects MongoDB driver internals and `Task.collection.insertMany`.
 *   To avoid this, tasks with specific createdAt values are inserted using
 *   `Task.create()` (Mongoose schema respects the provided `createdAt` when
 *   timestamps:true is active and we bypass the setter) OR we seed via
 *   Task.collection.insertMany BEFORE activating fake timers.
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

// Fixed deterministic dates — not dependent on machine clock
// ISO week: Mon 2024-01-08 to Sun 2024-01-14
const MONDAY_JAN_8  = new Date("2024-01-08T10:00:00.000Z");
const WEDNESDAY_JAN_10 = new Date("2024-01-10T10:00:00.000Z");
const SUNDAY_JAN_14 = new Date("2024-01-14T10:00:00.000Z");
// Previous week — far enough from the boundary to be unambiguous in any timezone
const SUNDAY_JAN_7  = new Date("2024-01-07T00:00:00.000Z");
const FRIDAY_JAN_5  = new Date("2024-01-05T10:00:00.000Z");

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

    // Activate fake clock only for the controller call
    vi.useFakeTimers({ now: WEDNESDAY_JAN_10.getTime() });
    const res = await request(app)
      .get("/api/tasks?filter=this_week")
      .set("X-Test-User-Id", USER);
    vi.useRealTimers();

    expect(res.status).toBe(200);
    const titles = res.body.tasks.map((t) => t.title);
    expect(titles).toContain("This Monday");
    expect(titles).not.toContain("Last Friday");
  });

  it("CORRECTED DEF-2: this_week on Sunday correctly includes current-week tasks (Mon Jan 8 included)", async () => {
    /**
     * DEF-2 FINAL ASSESSMENT:
     * The formula on Sunday Jan 14 (getDay()=0, getDate()=14):
     *   mondayDate = 14 - (0-1) - 7 = 14 + 1 - 7 = 8
     *   startDate = new Date(2024, 0, 8) → Jan 8, 2024 00:00 LOCAL time ✓
     *
     * The formula is algebraically correct. The prior test run appeared to
     * fail because the "Previous Sunday" task had createdAt 2024-01-07T23:59Z,
     * which in UTC+7 is 2024-01-08 06:59 local — AFTER the startDate of
     * Jan 8 00:00 local, causing it to appear in the current week.
     * Fixing the timestamp to 2024-01-07T00:00Z (unambiguously prior week)
     * confirms the formula is correct: DEF-2 is NOT a production defect.
     *
     * These assertions serve as regression guards.
     */
    // Seed BEFORE fake timers
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
    const res = await request(app)
      .get("/api/tasks?filter=this_week")
      .set("X-Test-User-Id", USER);
    vi.useRealTimers();

    expect(res.status).toBe(200);
    const titles = res.body.tasks.map((t) => t.title);

    // Formula on Sunday Jan 14: mondayDate = 14 + 1 - 7 = 8 → Jan 8 ✓
    // DEF-2 audit claim NOT reproduced. These are regression guards.
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
