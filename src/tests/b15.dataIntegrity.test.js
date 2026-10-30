/**
 * B15 — Data integrity: whitespace-only title behavior, sort order with date filters
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * B15-1: POST with whitespace-only title
 *   The Mongoose schema has { title: { type: String, required: true } }.
 *   Mongoose's required validator only rejects undefined/null/empty string (""),
 *   NOT whitespace-only strings ("   "). The controller does not trim the value.
 *   This means POST with title="   " is currently accepted with HTTP 201.
 *
 *   This test documents the OBSERVED behavior. The whitespace title is persisted
 *   as-is. This may or may not be intentional — the test does NOT assert that
 *   201 is the correct status; it asserts what the production code does today.
 *
 *   NOTE: If the decision is later made to reject whitespace-only titles (via
 *   schema { title: { trim: true, required: true } } or controller-level
 *   validation), the assertion must be updated in a separate approved change.
 *
 * B15-2 / B15-3: Sort order with this_week and today filters
 *   The controller applies { $sort: { createdAt: -1 } } inside the $facet
 *   pipeline regardless of which filter is active. B13 only verified this for
 *   filter=all_time. These tests confirm the sort is preserved when date
 *   filters are applied.
 *
 *   Fake timer + insertMany strategy follows B06/B10 to avoid MongoDB driver
 *   interference:
 *     1. Seed tasks with real timers (insertMany sets explicit createdAt).
 *     2. Activate fake clock only around the HTTP GET call.
 *     3. Restore real timers in a finally block.
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
const USER = "test-user-b15";

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

// ─── B15-1: Whitespace-only title ────────────────────────────────────────────

describe("B15-1 — POST with whitespace-only title (mocked auth)", () => {
  it("title='   ' with valid description → documents observed HTTP status (201: Mongoose does not reject whitespace)", async () => {
    /**
     * OBSERVED BEHAVIOR DOCUMENTATION:
     *   Mongoose required validator rejects: undefined, null, "".
     *   It does NOT reject "   " (whitespace-only). The controller does not trim.
     *   Therefore the current behavior is HTTP 201 with the whitespace title persisted.
     *
     *   This test will FAIL if a trim+required fix is applied in the future —
     *   which is the correct outcome; update the assertion to expect 400 at that time.
     */
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({ title: "   ", description: "Valid description" });

    // Document: Mongoose does not trim, so 201 is the current behavior.
    // If production adds trimming, change this assertion to toBe(400).
    expect(
      res.status,
      `Expected 201 (no trim validation), got ${res.status}: ${JSON.stringify(res.body)}`
    ).toBe(201);

    // If accepted, the title is persisted as-is (whitespace not trimmed)
    if (res.status === 201) {
      expect(res.body.title).toBe("   ");
      expect(res.body.userId).toBe(USER);

      // Verify the whitespace title was persisted in the database
      const doc = await getTask().findById(res.body._id);
      expect(doc).not.toBeNull();
      expect(doc.title).toBe("   ");
    }
  });

  it("title=' \\t\\n ' (tab and newline) → 201 (Mongoose required does not reject whitespace-only strings)", async () => {
    /**
     * Same behavior as the spaces-only case: Mongoose required only rejects
     * undefined, null, and "". A tab+newline string is not empty, so it passes
     * validation and the controller returns 201 with the title persisted as-is.
     */
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({ title: " \t\n ", description: "Valid description" });

    expect(
      res.status,
      `Expected 201 (no trim validation), got ${res.status}: ${JSON.stringify(res.body)}`
    ).toBe(201);

    // Title persisted exactly as submitted (no trimming)
    expect(res.body.title).toBe(" \t\n ");
    expect(res.body.userId).toBe(USER);

    const doc = await getTask().findById(res.body._id);
    expect(doc).not.toBeNull();
    expect(doc.title).toBe(" \t\n ");
  });

  it("empty string title '' → 400 (Mongoose required: false for empty string)", async () => {
    // This is the existing B04 baseline — confirmed here for contrast with
    // the whitespace-only case above. Empty string IS rejected; "   " is not.
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({ title: "", description: "Valid description" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
  });
});

// ─── B15-2: Sort order with filter=this_week ─────────────────────────────────

describe("B15-2 — Sort order (createdAt descending) with filter=this_week (mocked auth)", () => {
  /**
   * Reference week: Mon 2024-01-08 to Sun 2024-01-14.
   * "Now" is fixed to Wednesday 2024-01-10T12:00:00Z.
   *
   * Three tasks all within the same week, seeded with explicit createdAt values.
   * The newest (Wednesday) must appear first in the response.
   */
  const NOW_WEDNESDAY = new Date("2024-01-10T12:00:00.000Z");
  const MONDAY   = new Date("2024-01-08T09:00:00.000Z"); // oldest within week
  const TUESDAY  = new Date("2024-01-09T14:00:00.000Z"); // middle
  const WEDNESDAY_TASK = new Date("2024-01-10T08:00:00.000Z"); // newest (before "now")

  it("tasks within this_week are sorted newest-first (createdAt: -1)", async () => {
    // Seed with real timers — insertMany sets the exact createdAt we specify
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Monday task",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: MONDAY,
        updatedAt: MONDAY,
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Tuesday task",
        description: "d",
        userId: USER,
        status: "inprogress",
        createdAt: TUESDAY,
        updatedAt: TUESDAY,
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Wednesday task",
        description: "d",
        userId: USER,
        status: "completed",
        createdAt: WEDNESDAY_TASK,
        updatedAt: WEDNESDAY_TASK,
        completedAt: WEDNESDAY_TASK,
      },
    ]);

    // Activate fake timers only for the controller call
    vi.useFakeTimers({ now: NOW_WEDNESDAY.getTime() });
    let res;
    try {
      res = await request(app)
        .get("/api/tasks?filter=this_week")
        .set("X-Test-User-Id", USER);
    } finally {
      vi.useRealTimers();
    }

    expect(res.status).toBe(200);
    const tasks = res.body.tasks;
    expect(tasks).toHaveLength(3);

    // Verify sort order: Wednesday (newest) → Tuesday → Monday (oldest)
    expect(tasks[0].title).toBe("Wednesday task");
    expect(tasks[1].title).toBe("Tuesday task");
    expect(tasks[2].title).toBe("Monday task");
  });

  it("createdAt values in response are strictly non-ascending (no ordering inversion)", async () => {
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Earlier",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: MONDAY,
        updatedAt: MONDAY,
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Later",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: WEDNESDAY_TASK,
        updatedAt: WEDNESDAY_TASK,
        completedAt: null,
      },
    ]);

    vi.useFakeTimers({ now: NOW_WEDNESDAY.getTime() });
    let res;
    try {
      res = await request(app)
        .get("/api/tasks?filter=this_week")
        .set("X-Test-User-Id", USER);
    } finally {
      vi.useRealTimers();
    }

    expect(res.status).toBe(200);
    const tasks = res.body.tasks;
    expect(tasks).toHaveLength(2);

    // "Later" task (Wednesday) must come before "Earlier" task (Monday)
    const returnedDates = tasks.map((t) => new Date(t.createdAt).getTime());
    expect(returnedDates[0]).toBeGreaterThanOrEqual(returnedDates[1]);
  });
});

// ─── B15-3: Sort order with filter=today ─────────────────────────────────────

describe("B15-3 — Sort order (createdAt descending) with filter=today (mocked auth)", () => {
  /**
   * "Now" is fixed to 2024-03-15T12:00:00Z (same as B10).
   * Two tasks both created on 2024-03-15 but at different hours.
   * The later-in-the-day task must appear first.
   */
  /**
   * "Now" is fixed to 2024-03-15T10:00:00Z.
   * On this UTC+7 machine, now is local 2024-03-15T17:00:00+07:00 (5 PM, March 15).
   * The controller computes startDate = new Date(year, month, date) in LOCAL time:
   *   startDate = 2024-03-15T00:00:00+07:00 = 2024-03-14T17:00:00.000Z
   * All task timestamps must satisfy:
   *   createdAt >= 2024-03-14T17:00:00Z  (within today's local window)
   *   createdAt <  2024-03-15T10:00:00Z  (in the past relative to 'now')
   * The filter has no upper-bound check; both tasks are thus returned by today.
   */
  const NOW_UTC      = new Date("2024-03-15T10:00:00.000Z"); // local 17:00+07 on March 15
  const EARLY_TODAY  = new Date("2024-03-14T18:00:00.000Z"); // local 01:00+07 on March 15
  const LATE_MORNING = new Date("2024-03-15T08:00:00.000Z"); // local 15:00+07 on March 15

  it("multiple tasks created today are sorted newest-first", async () => {
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Early today",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: EARLY_TODAY,
        updatedAt: EARLY_TODAY,
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Late morning",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: LATE_MORNING,
        updatedAt: LATE_MORNING,
        completedAt: null,
      },
    ]);

    vi.useFakeTimers({ now: NOW_UTC.getTime() });
    let res;
    try {
      res = await request(app)
        .get("/api/tasks?filter=today")
        .set("X-Test-User-Id", USER);
    } finally {
      vi.useRealTimers();
    }

    expect(res.status).toBe(200);
    const tasks = res.body.tasks;
    // Both tasks must be included: createdAt within today's date range
    expect(tasks).toHaveLength(2);

    // "Late morning" (10:00 UTC) is newer than "Early today" (08:00 UTC)
    expect(tasks[0].title).toBe("Late morning");
    expect(tasks[1].title).toBe("Early today");

    const dates = tasks.map((t) => new Date(t.createdAt).getTime());
    expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
  });

  it("sort order is stable regardless of database insertion order", async () => {
    /**
     * Insert the older task FIRST and the newer task SECOND.
     * If sort were by insertion order, the older task would appear first.
     * Correct behavior (createdAt: -1) puts the newer task first.
     * Both timestamps are within today's local window and before NOW_UTC.
     *   startDate = 2024-03-14T17:00:00Z (local midnight UTC+7)
     *   NOW_UTC   = 2024-03-15T10:00:00Z
     */
    const OLDER = new Date("2024-03-14T17:30:00.000Z"); // local 00:30+07 on March 15
    const NEWER = new Date("2024-03-15T06:00:00.000Z"); // local 13:00+07 on March 15

    // Insert older FIRST (insertion order would put it first if sort is wrong)
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Older",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: OLDER,
        updatedAt: OLDER,
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Newer",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: NEWER,
        updatedAt: NEWER,
        completedAt: null,
      },
    ]);

    vi.useFakeTimers({ now: NOW_UTC.getTime() });
    let res;
    try {
      res = await request(app)
        .get("/api/tasks?filter=today")
        .set("X-Test-User-Id", USER);
    } finally {
      vi.useRealTimers();
    }

    expect(res.status).toBe(200);
    // Both tasks must appear; no conditional guard
    expect(res.body.tasks).toHaveLength(2);
    // "Newer" must appear first despite being inserted second
    expect(res.body.tasks[0].title).toBe("Newer");
    expect(res.body.tasks[1].title).toBe("Older");
  });
});
