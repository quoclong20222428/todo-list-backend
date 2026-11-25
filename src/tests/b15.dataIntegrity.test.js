/**
 * B15 — Data integrity: whitespace-only title behavior, sort order with date filters
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * B15-1: POST with whitespace-only title
 *   The Mongoose schema has { title: { type: String, required: true } }.
 *   Mongoose 8's required validator only rejects undefined/null/empty string ("").
 *   Whitespace-only strings ("   ") are NOT trimmed by Mongoose 8 before the
 *   required check — they pass validation and are persisted as-is.
 *   The controller does not trim either.
 *
 *   These tests assert the actual Mongoose 8.x behavior: whitespace-only titles
 *   are accepted (HTTP 201) and stored verbatim.
 *
 * B15-2 / B15-3: Sort order with this_week and today filters
 *   The controller applies { $sort: { createdAt: -1 } } inside the $facet
 *   pipeline regardless of which filter is active. B13 only verified this for
 *   filter=all_time. These tests confirm the sort is preserved when date
 *   filters are applied.
 *
 *   UTC CALENDAR CONTRACT:
 *     All date boundaries are computed using getUTCDateRange() with UTC methods.
 *     Fixtures use explicit UTC timestamps that are deterministic regardless
 *     of host timezone.
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
  it("title='   ' with valid description → 201 (Mongoose 8 does not reject whitespace-only strings)", async () => {
    // Mongoose 8 required validator rejects: undefined, null, "".
    // Whitespace-only strings ("   ") pass required check and are persisted as-is.
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({ title: "   ", description: "Valid description" });

    expect(
      res.status,
      `Expected 201 (Mongoose 8 does not reject whitespace-only), got ${res.status}: ${JSON.stringify(res.body)}`
    ).toBe(201);

    // Title persisted exactly as submitted (not trimmed)
    expect(res.body.title).toBe("   ");
    expect(res.body.userId).toBe(USER);

    // Verify the whitespace title was persisted in the database
    const doc = await getTask().findById(res.body._id);
    expect(doc).not.toBeNull();
    expect(doc.title).toBe("   ");
  });

  it("title=' \\t\\n ' (tab and newline) → 201 (Mongoose 8 does not reject whitespace-only strings)", async () => {
    // Same as the spaces-only case: Mongoose 8 required only rejects undefined,
    // null, and "". A tab+newline string passes validation and is persisted as-is.
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({ title: " \t\n ", description: "Valid description" });

    expect(
      res.status,
      `Expected 201 (Mongoose 8 does not reject whitespace-only), got ${res.status}: ${JSON.stringify(res.body)}`
    ).toBe(201);

    // Title persisted exactly as submitted (no trimming)
    expect(res.body.title).toBe(" \t\n ");
    expect(res.body.userId).toBe(USER);

    const doc = await getTask().findById(res.body._id);
    expect(doc).not.toBeNull();
    expect(doc.title).toBe(" \t\n ");
  });

  it("empty string title '' → 400 (Mongoose required rejects empty string)", async () => {
    // Empty string "" IS rejected by Mongoose 8 required validator (unlike "   "
    // which passes). This confirms the boundary: empty string → 400, whitespace → 201.
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
   * Reference week: Mon 2024-01-08 to Sun 2024-01-14 (UTC).
   * "Now" is fixed to Wednesday 2024-01-10T12:00:00Z.
   *
   * UTC calendar: this_week = [2024-01-08T00:00Z, 2024-01-15T00:00Z)
   *
   * Three tasks all within the same week, seeded with explicit createdAt values.
   * The newest (Wednesday) must appear first in the response.
   */
  const NOW_WEDNESDAY = new Date("2024-01-10T12:00:00.000Z");
  const MONDAY   = new Date("2024-01-08T13:00:00.000Z"); // oldest within week
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
   * UTC CALENDAR CONTRACT:
   *   "Now" = 2024-03-14T23:00:00Z
   *   today = [2024-03-14T00:00:00Z, 2024-03-15T00:00:00Z)
   *
   *   EARLY_TODAY  = 2024-03-14T18:00:00Z → within [Mar 14, Mar 15) UTC ✓
   *   LATE_MORNING = 2024-03-14T21:00:00Z → within [Mar 14, Mar 15) UTC ✓; newer ✓
   */
  const NOW_UTC      = new Date("2024-03-14T23:00:00.000Z");
  const EARLY_TODAY  = new Date("2024-03-14T18:00:00.000Z"); // 6 pm UTC (older)
  const LATE_MORNING = new Date("2024-03-14T21:00:00.000Z"); // 9 pm UTC (newer)

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
    // Both tasks must be included: createdAt within today's UTC range
    expect(tasks).toHaveLength(2);

    // "Late morning" (21:00 UTC) is newer than "Early today" (18:00 UTC)
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
     *
     * UTC CALENDAR:
     *   Both timestamps are within [Mar 14 00:00 UTC, Mar 15 00:00 UTC)
     *   and before NOW_UTC (23:00Z).
     */
    const OLDER = new Date("2024-03-14T18:00:00.000Z"); // 6 pm UTC (older)
    const NEWER = new Date("2024-03-14T21:00:00.000Z"); // 9 pm UTC (newer)

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
