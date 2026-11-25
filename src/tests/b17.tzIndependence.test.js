/**
 * B17 — Host timezone independence tests
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * CRITICAL REQUIREMENT:
 *   The same reference instant must produce identical UTC date boundaries
 *   and identical filtering results regardless of the Node.js process
 *   timezone (process.env.TZ).
 *
 * STRATEGY:
 *   Since getUTCDateRange() exclusively uses UTC methods (getUTCFullYear,
 *   getUTCMonth, getUTCDate, getUTCDay, Date.UTC), its output is
 *   mathematically guaranteed to be TZ-independent. We verify this in four
 *   separate test sections:
 *
 *   PART 1 — UNIT TESTS (B17-unit):
 *     Call getUTCDateRange with a fixed `now` epoch instant and assert that
 *     the returned boundaries exactly match precomputed expected UTC strings.
 *     Because both the input (epoch ms) and the UTC methods used internally
 *     are timezone-independent, the output must always match — regardless of
 *     the host timezone set when the process was launched. These tests do not
 *     and cannot change process.env.TZ at runtime (Node.js caches the C-level
 *     timezone at startup; runtime changes are unreliable). Instead, the
 *     cross-process runner (b17.crossTz.runner.js) reruns the entire suite
 *     under different TZ environments to confirm identical results.
 *
 *   PART 2 — PROOF TESTS (B17-proof):
 *     Show that specific boundary-crossing instants are computed correctly by
 *     UTC methods and would be wrong if local-time methods were used instead.
 *     For example, 23:00 UTC on Mar 15 is already Mar 16 in UTC+7; a buggy
 *     implementation using local methods on a UTC+7 host would return Mar 16
 *     boundaries instead of Mar 15.
 *
 *   PART 3 — INTEGRATION TESTS (B17-int):
 *     Seed a fixed set of tasks with deterministic createdAt timestamps into
 *     MongoDB, freeze the clock to a fixed UTC epoch via vi.useFakeTimers,
 *     then call the actual HTTP controller and compare the returned task IDs
 *     against a static expected set. The expected IDs are derived from a
 *     hardcoded mapping (not from getUTCDateRange), so the oracle is
 *     independent of the implementation under test.
 *
 *   PART 4 — REGRESSION TESTS (B17-regression):
 *     Read the getUTCDateRange source file and assert that no local-time
 *     JavaScript methods appear in it.
 *
 *   CROSS-PROCESS VERIFICATION (b17.crossTz.runner.js, separate script):
 *     Spawns `npx vitest run` in child processes under multiple TZ values
 *     and verifies that the full test suite produces identical results in
 *     every timezone environment.
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
import { getUTCDateRange } from "../utils/getUTCDateRange.js";

const getTask = () => mongoose.model("Task");
const USER = "test-user-b17";

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
  vi.useRealTimers();
  await clearTasks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Reference instants (epoch ms) — these are timezone-independent by definition
// ═══════════════════════════════════════════════════════════════════════════════

const INSTANTS = {
  // 2024-03-15T14:00:00Z (Friday afternoon UTC)
  friday_afternoon: Date.UTC(2024, 2, 15, 14, 0, 0, 0),
  // 2024-01-14T22:00:00Z (Sunday night UTC)
  sunday_night: Date.UTC(2024, 0, 14, 22, 0, 0, 0),
  // 2024-12-31T23:00:00Z (New Year's Eve UTC)
  nye: Date.UTC(2024, 11, 31, 23, 0, 0, 0),
  // 2024-02-29T12:00:00Z (Leap day UTC)
  leap_day: Date.UTC(2024, 1, 29, 12, 0, 0, 0),
};

// Expected boundaries (precomputed, UTC)
const EXPECTED = {
  friday_afternoon: {
    today: { start: "2024-03-15T00:00:00.000Z", end: "2024-03-16T00:00:00.000Z" },
    this_week: { start: "2024-03-11T00:00:00.000Z", end: "2024-03-18T00:00:00.000Z" },
    this_month: { start: "2024-03-01T00:00:00.000Z", end: "2024-04-01T00:00:00.000Z" },
  },
  sunday_night: {
    today: { start: "2024-01-14T00:00:00.000Z", end: "2024-01-15T00:00:00.000Z" },
    this_week: { start: "2024-01-08T00:00:00.000Z", end: "2024-01-15T00:00:00.000Z" },
    this_month: { start: "2024-01-01T00:00:00.000Z", end: "2024-02-01T00:00:00.000Z" },
  },
  nye: {
    today: { start: "2024-12-31T00:00:00.000Z", end: "2025-01-01T00:00:00.000Z" },
    this_week: { start: "2024-12-30T00:00:00.000Z", end: "2025-01-06T00:00:00.000Z" },
    this_month: { start: "2024-12-01T00:00:00.000Z", end: "2025-01-01T00:00:00.000Z" },
  },
  leap_day: {
    today: { start: "2024-02-29T00:00:00.000Z", end: "2024-03-01T00:00:00.000Z" },
    this_week: { start: "2024-02-26T00:00:00.000Z", end: "2024-03-04T00:00:00.000Z" },
    this_month: { start: "2024-02-01T00:00:00.000Z", end: "2024-03-01T00:00:00.000Z" },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1: Verify getUTCDateRange produces identical output for all instants
// ═══════════════════════════════════════════════════════════════════════════════

describe("B17-unit — getUTCDateRange produces identical boundaries regardless of host timezone", () => {
  for (const [instantName, epochMs] of Object.entries(INSTANTS)) {
    for (const filter of ["today", "this_week", "this_month"]) {
      it(`${instantName} + ${filter}: boundaries match expected UTC values`, () => {
        // Create Date from epoch ms — this is TZ-independent
        const now = new Date(epochMs);
        const { startDate, endDate } = getUTCDateRange(filter, now);

        const expected = EXPECTED[instantName][filter];
        expect(startDate.toISOString()).toBe(expected.start);
        expect(endDate.toISOString()).toBe(expected.end);
      });
    }
  }

  // Verify all_time returns null regardless of instant
  for (const [instantName, epochMs] of Object.entries(INSTANTS)) {
    it(`${instantName} + all_time: returns null boundaries`, () => {
      const now = new Date(epochMs);
      const { startDate, endDate } = getUTCDateRange("all_time", now);
      expect(startDate).toBeNull();
      expect(endDate).toBeNull();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2: Verify that no local-time methods are used in date boundary calc
//
// If the utility mistakenly used getFullYear/getMonth/getDate/getDay (local
// methods) instead of their UTC counterparts, the boundaries would differ when
// the UTC date and local date disagree. We test a time (23:00 UTC on Mar 15)
// that in UTC+7 is already Mar 16 — if local methods were used on a UTC+7 host,
// "today" would return Mar 16 boundaries instead of Mar 15.
// ═══════════════════════════════════════════════════════════════════════════════

describe("B17-proof — Boundaries are UTC, not local", () => {
  it("23:00 UTC on Mar 15 → today is Mar 15, not Mar 16 (would be wrong with local methods on UTC+7)", () => {
    const now = new Date("2024-03-15T23:00:00.000Z");
    const { startDate, endDate } = getUTCDateRange("today", now);
    // UTC date is Mar 15 → boundaries must be Mar 15 to Mar 16
    expect(startDate.toISOString()).toBe("2024-03-15T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2024-03-16T00:00:00.000Z");
  });

  it("01:00 UTC on Mar 15 → today is Mar 15, not Mar 14 (would be wrong with local methods on UTC-5)", () => {
    const now = new Date("2024-03-15T01:00:00.000Z");
    const { startDate, endDate } = getUTCDateRange("today", now);
    expect(startDate.toISOString()).toBe("2024-03-15T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2024-03-16T00:00:00.000Z");
  });

  it("NYE 23:00 UTC → this_month is December, not January (would be wrong with local methods on UTC+2)", () => {
    const now = new Date("2024-12-31T23:00:00.000Z");
    const { startDate } = getUTCDateRange("this_month", now);
    expect(startDate.toISOString()).toBe("2024-12-01T00:00:00.000Z");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3: Integration — same fake clock produces same task IDs from MongoDB
//
// Reference time: 2024-06-15T14:00:00.000Z (Saturday, UTC)
//
// UTC week boundaries:   [2024-06-10T00:00:00.000Z, 2024-06-17T00:00:00.000Z)
//   Jun 15 (Sat): getUTCDay()=6 → daysSinceMonday=5 → weekStart = Jun 15 - 5 = Jun 10
//
// UTC month boundaries:  [2024-06-01T00:00:00.000Z, 2024-07-01T00:00:00.000Z)
//
// Seeded tasks and which filters they appear in:
//   "In-today"     2024-06-15T10:00:00.000Z  → today ✓, this_week ✓, this_month ✓, all_time ✓
//   "Before-today" 2024-06-14T23:59:59.999Z  → today ✗ (Jun 14 < Jun 15 start)
//                                               this_week ✓ (Jun 14 ≥ Jun 10)
//                                               this_month ✓, all_time ✓
//   "In-week"      2024-06-10T12:00:00.000Z  → today ✗, this_week ✓, this_month ✓, all_time ✓
//   "Before-week"  2024-06-09T23:59:59.999Z  → today ✗, this_week ✗ (Jun 9 < Jun 10 start)
//                                               this_month ✓ (Jun 9 ≥ Jun 1), all_time ✓
//   "In-month"     2024-06-01T00:00:00.000Z  → today ✗, this_week ✗, this_month ✓, all_time ✓
//   "Before-month" 2024-05-31T23:59:59.999Z  → today ✗, this_week ✗, this_month ✗, all_time ✓
//   "Ancient"      2020-01-01T00:00:00.000Z  → today ✗, this_week ✗, this_month ✗, all_time ✓
// ═══════════════════════════════════════════════════════════════════════════════

describe("B17-int — Controller returns identical results for same epoch instant", () => {
  const SEED_TASKS = [
    { title: "In-today",     createdAt: "2024-06-15T10:00:00.000Z" },
    { title: "Before-today", createdAt: "2024-06-14T23:59:59.999Z" },
    { title: "In-week",      createdAt: "2024-06-10T12:00:00.000Z" },
    { title: "Before-week",  createdAt: "2024-06-09T23:59:59.999Z" },
    { title: "In-month",     createdAt: "2024-06-01T00:00:00.000Z" },
    { title: "Before-month", createdAt: "2024-05-31T23:59:59.999Z" },
    { title: "Ancient",      createdAt: "2020-01-01T00:00:00.000Z" },
  ];

  // Now = 2024-06-15T14:00:00.000Z (Saturday)
  const NOW_EPOCH = Date.UTC(2024, 5, 15, 14, 0, 0, 0);

  // Static expected task sets — independent of getUTCDateRange().
  // Derived by applying filter boundary math manually (see block comment above).
  const EXPECTED_TITLES = {
    today:      ["In-today"],
    this_week:  ["In-today", "Before-today", "In-week"],
    this_month: ["In-today", "Before-today", "In-week", "Before-week", "In-month"],
    all_time:   ["In-today", "Before-today", "In-week", "Before-week", "In-month", "Before-month", "Ancient"],
  };

  for (const filter of ["today", "this_week", "this_month", "all_time"]) {
    it(`filter=${filter}: returns consistent task set (by ID)`, async () => {
      // Seed all tasks and collect the MongoDB ObjectId for each title.
      const seedMap = {};
      for (const { title, createdAt } of SEED_TASKS) {
        const id = await seedTask(title, createdAt);
        seedMap[title] = id.toString();
      }

      // Freeze the clock to the deterministic reference instant.
      vi.useFakeTimers({ now: NOW_EPOCH });
      let res;
      try {
        res = await request(app)
          .get(`/api/tasks?filter=${filter}`)
          .set("X-Test-User-Id", USER);
      } finally {
        // Always restore real timers, even if the request throws.
        vi.useRealTimers();
      }

      expect(res.status).toBe(200);

      // Derive expected IDs from the static title mapping (not from the utility).
      const expectedIds = EXPECTED_TITLES[filter]
        .map((title) => seedMap[title])
        .sort();

      // Extract and sort actual IDs returned by the controller.
      const actualIds = res.body.tasks.map((t) => t._id.toString()).sort();

      expect(actualIds).toEqual(expectedIds);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4: Verify the old local-time code path is gone
// ═══════════════════════════════════════════════════════════════════════════════

describe("B17-regression — No local-time methods in getUTCDateRange source", () => {
  it("getUTCDateRange.toString() does not contain getFullYear/getMonth/getDate/getDay/setDate (local methods)", async () => {
    // Read the source file to verify no local-time methods are used
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const srcPath = path.resolve(
      import.meta.dirname,
      "..",
      "utils",
      "getUTCDateRange.js"
    );
    const source = await fs.readFile(srcPath, "utf-8");

    // These local-time methods must NOT appear (UTC variants are fine)
    const localMethods = [
      /(?<!UTC)getFullYear\s*\(/,
      /(?<!UTC)getMonth\s*\(/,
      /(?<!UTC)getDate\s*\(/,
      /(?<!UTC)getDay\s*\(/,
      /(?<!UTC)setDate\s*\(/,
      /new Date\(\s*\d{4}\s*,/, // new Date(year, month, ...) is local-time
    ];

    for (const pattern of localMethods) {
      expect(
        pattern.test(source),
        `Source should not use local-time method matching ${pattern}`
      ).toBe(false);
    }
  });
});

// ─── Helper (duplicated from B16 for independence) ───────────────────────────

async function seedTask(title, createdAt) {
  const id = new mongoose.Types.ObjectId();
  await getTask().collection.insertMany([
    {
      _id: id,
      title,
      description: "d",
      userId: USER,
      status: "pending",
      createdAt: new Date(createdAt),
      updatedAt: new Date(createdAt),
      completedAt: null,
    },
  ]);
  return id;
}
