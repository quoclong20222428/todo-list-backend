/**
 * B16 — Comprehensive UTC date boundary tests
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * Tests the getUTCDateRange utility directly and verifies integration with
 * the controller's MongoDB queries for all filter types.
 *
 * All boundaries use half-open intervals: [startDate, endDate)
 *
 * Coverage:
 *   - Today: exact startDate, 1ms before start, 1ms before end, exact endDate
 *   - This Week: Monday 00:00 UTC, Sunday 23:59:59.999 UTC, next Monday 00:00 UTC
 *   - This Month: 1st day 00:00 UTC, last ms of month, 1st of next month
 *   - Calendar edge cases: month transitions, Dec→Jan year rollover,
 *     leap-year Feb, non-leap Feb, Sunday-to-Monday week boundary
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
const USER = "test-user-b16";

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

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Insert a task with explicit createdAt and return its _id */
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

/** GET /api/tasks with fake clock, return response */
async function fetchWithClock(nowMs, filter) {
  vi.useFakeTimers({ now: nowMs });
  try {
    return await request(app)
      .get(`/api/tasks?filter=${filter}`)
      .set("X-Test-User-Id", USER);
  } finally {
    vi.useRealTimers();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1: getUTCDateRange unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("B16-unit — getUTCDateRange utility", () => {
  describe("today", () => {
    it("returns [00:00 UTC today, 00:00 UTC tomorrow)", () => {
      const now = new Date("2024-03-15T14:30:00.000Z");
      const { startDate, endDate } = getUTCDateRange("today", now);
      expect(startDate.toISOString()).toBe("2024-03-15T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2024-03-16T00:00:00.000Z");
    });

    it("handles UTC midnight exactly (00:00:00.000)", () => {
      const now = new Date("2024-03-15T00:00:00.000Z");
      const { startDate, endDate } = getUTCDateRange("today", now);
      expect(startDate.toISOString()).toBe("2024-03-15T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2024-03-16T00:00:00.000Z");
    });

    it("handles 23:59:59.999 UTC (last ms of day)", () => {
      const now = new Date("2024-03-15T23:59:59.999Z");
      const { startDate, endDate } = getUTCDateRange("today", now);
      expect(startDate.toISOString()).toBe("2024-03-15T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2024-03-16T00:00:00.000Z");
    });
  });

  describe("this_week", () => {
    it("Wednesday → Monday of same week to next Monday", () => {
      // Wed Jan 10, 2024 → Mon Jan 8 to Mon Jan 15
      const now = new Date("2024-01-10T12:00:00.000Z");
      const { startDate, endDate } = getUTCDateRange("this_week", now);
      expect(startDate.toISOString()).toBe("2024-01-08T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2024-01-15T00:00:00.000Z");
    });

    it("Monday → starts on itself", () => {
      const now = new Date("2024-01-08T05:00:00.000Z");
      const { startDate, endDate } = getUTCDateRange("this_week", now);
      expect(startDate.toISOString()).toBe("2024-01-08T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2024-01-15T00:00:00.000Z");
    });

    it("Sunday → includes Mon–Sun of that week", () => {
      // Sun Jan 14, 2024 (getUTCDay()=0) → Mon Jan 8 to Mon Jan 15
      const now = new Date("2024-01-14T18:00:00.000Z");
      const { startDate, endDate } = getUTCDateRange("this_week", now);
      expect(startDate.toISOString()).toBe("2024-01-08T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2024-01-15T00:00:00.000Z");
    });

    it("Sunday-to-Monday transition: Sun Jan 7 and Mon Jan 8 are different weeks", () => {
      const sunRange = getUTCDateRange("this_week", new Date("2024-01-07T23:59:59.999Z"));
      const monRange = getUTCDateRange("this_week", new Date("2024-01-08T00:00:00.000Z"));
      // Sunday Jan 7 is in the week starting Mon Jan 1
      expect(sunRange.startDate.toISOString()).toBe("2024-01-01T00:00:00.000Z");
      // Monday Jan 8 starts a new week
      expect(monRange.startDate.toISOString()).toBe("2024-01-08T00:00:00.000Z");
    });

    it("handles week crossing month boundary (Mon in Jan, Sun in Feb)", () => {
      // Mon Jan 29, 2024 to Sun Feb 4, 2024
      const now = new Date("2024-02-01T10:00:00.000Z"); // Thursday
      const { startDate, endDate } = getUTCDateRange("this_week", now);
      expect(startDate.toISOString()).toBe("2024-01-29T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2024-02-05T00:00:00.000Z");
    });
  });

  describe("this_month", () => {
    it("returns [1st of month, 1st of next month) UTC", () => {
      const now = new Date("2024-03-15T12:00:00.000Z");
      const { startDate, endDate } = getUTCDateRange("this_month", now);
      expect(startDate.toISOString()).toBe("2024-03-01T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2024-04-01T00:00:00.000Z");
    });

    it("December → endDate is Jan 1 of next year", () => {
      const now = new Date("2024-12-25T12:00:00.000Z");
      const { startDate, endDate } = getUTCDateRange("this_month", now);
      expect(startDate.toISOString()).toBe("2024-12-01T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    });

    it("leap year February has endDate March 1", () => {
      const now = new Date("2024-02-15T12:00:00.000Z"); // 2024 is leap year
      const { startDate, endDate } = getUTCDateRange("this_month", now);
      expect(startDate.toISOString()).toBe("2024-02-01T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    });

    it("non-leap year February has endDate March 1", () => {
      const now = new Date("2023-02-15T12:00:00.000Z"); // 2023 is not leap year
      const { startDate, endDate } = getUTCDateRange("this_month", now);
      expect(startDate.toISOString()).toBe("2023-02-01T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2023-03-01T00:00:00.000Z");
    });

    it("January → endDate is Feb 1 of same year", () => {
      const now = new Date("2024-01-01T00:00:00.000Z");
      const { startDate, endDate } = getUTCDateRange("this_month", now);
      expect(startDate.toISOString()).toBe("2024-01-01T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    });
  });

  describe("all_time", () => {
    it("returns null for both dates", () => {
      const { startDate, endDate } = getUTCDateRange("all_time");
      expect(startDate).toBeNull();
      expect(endDate).toBeNull();
    });
  });

  describe("unknown filter", () => {
    it("returns null for both dates (default branch)", () => {
      const { startDate, endDate } = getUTCDateRange("invalid_value");
      expect(startDate).toBeNull();
      expect(endDate).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2: Integration tests — half-open boundary verification via HTTP
// ═══════════════════════════════════════════════════════════════════════════════

describe("B16-int — Today filter half-open boundary [start, end)", () => {
  // Now = 2024-06-15T12:00:00Z (Saturday)
  // Today range: [2024-06-15T00:00:00Z, 2024-06-16T00:00:00Z)
  const NOW = new Date("2024-06-15T12:00:00.000Z");

  it("task exactly at startDate (00:00:00.000 UTC) → included", async () => {
    await seedTask("At start", "2024-06-15T00:00:00.000Z");
    const res = await fetchWithClock(NOW.getTime(), "today");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).toContain("At start");
  });

  it("task 1ms before startDate → excluded", async () => {
    await seedTask("Before start", "2024-06-14T23:59:59.999Z");
    const res = await fetchWithClock(NOW.getTime(), "today");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).not.toContain("Before start");
  });

  it("task 1ms before endDate (23:59:59.999 UTC) → included", async () => {
    await seedTask("Before end", "2024-06-15T23:59:59.999Z");
    const res = await fetchWithClock(NOW.getTime(), "today");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).toContain("Before end");
  });

  it("task exactly at endDate (next day 00:00:00.000 UTC) → excluded", async () => {
    await seedTask("At end", "2024-06-16T00:00:00.000Z");
    const res = await fetchWithClock(NOW.getTime(), "today");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).not.toContain("At end");
  });
});

describe("B16-int — This Week filter half-open boundary", () => {
  // Now = Wed 2024-01-10T12:00Z
  // Week range: [Mon 2024-01-08T00:00Z, Mon 2024-01-15T00:00Z)
  const NOW = new Date("2024-01-10T12:00:00.000Z");

  it("Monday 00:00:00.000 UTC → included", async () => {
    await seedTask("Mon start", "2024-01-08T00:00:00.000Z");
    const res = await fetchWithClock(NOW.getTime(), "this_week");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).toContain("Mon start");
  });

  it("Sunday 23:59:59.999 UTC → included", async () => {
    await seedTask("Sun end", "2024-01-14T23:59:59.999Z");
    const res = await fetchWithClock(NOW.getTime(), "this_week");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).toContain("Sun end");
  });

  it("next Monday 00:00:00.000 UTC → excluded", async () => {
    await seedTask("Next Mon", "2024-01-15T00:00:00.000Z");
    const res = await fetchWithClock(NOW.getTime(), "this_week");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).not.toContain("Next Mon");
  });

  it("previous Sunday 23:59:59.999 UTC → excluded", async () => {
    await seedTask("Prev Sun", "2024-01-07T23:59:59.999Z");
    const res = await fetchWithClock(NOW.getTime(), "this_week");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).not.toContain("Prev Sun");
  });

  it("Sunday-to-Monday week transition: clock on Sunday includes that week's Monday", async () => {
    // Clock on Sunday Jan 14 → week is [Jan 8, Jan 15)
    await seedTask("Monday task", "2024-01-08T10:00:00.000Z");
    const res = await fetchWithClock(
      new Date("2024-01-14T20:00:00.000Z").getTime(),
      "this_week"
    );
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).toContain("Monday task");
  });
});

describe("B16-int — This Month filter half-open boundary", () => {
  // Now = 2024-03-15T12:00Z
  // Month range: [2024-03-01T00:00Z, 2024-04-01T00:00Z)
  const NOW = new Date("2024-03-15T12:00:00.000Z");

  it("first day of month at 00:00 UTC → included", async () => {
    await seedTask("Mar 1st", "2024-03-01T00:00:00.000Z");
    const res = await fetchWithClock(NOW.getTime(), "this_month");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).toContain("Mar 1st");
  });

  it("last millisecond of month → included", async () => {
    await seedTask("Mar 31 end", "2024-03-31T23:59:59.999Z");
    const res = await fetchWithClock(NOW.getTime(), "this_month");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).toContain("Mar 31 end");
  });

  it("first day of next month at 00:00 UTC → excluded", async () => {
    await seedTask("Apr 1st", "2024-04-01T00:00:00.000Z");
    const res = await fetchWithClock(NOW.getTime(), "this_month");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).not.toContain("Apr 1st");
  });

  it("last day of previous month → excluded", async () => {
    await seedTask("Feb 29", "2024-02-29T23:59:59.999Z");
    const res = await fetchWithClock(NOW.getTime(), "this_month");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).not.toContain("Feb 29");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3: Calendar edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("B16-edge — Calendar edge cases", () => {
  it("December-to-January year transition: Dec task in this_month, Jan excluded", async () => {
    const DEC_NOW = new Date("2024-12-20T12:00:00.000Z");
    await seedTask("Dec task", "2024-12-15T10:00:00.000Z");
    await seedTask("Jan task", "2025-01-01T00:00:00.000Z");

    const res = await fetchWithClock(DEC_NOW.getTime(), "this_month");
    expect(res.status).toBe(200);
    const titles = res.body.tasks.map((t) => t.title);
    expect(titles).toContain("Dec task");
    expect(titles).not.toContain("Jan task");
  });

  it("leap year Feb 29: task on Feb 29 included in this_month", async () => {
    const FEB_NOW = new Date("2024-02-15T12:00:00.000Z");
    await seedTask("Leap Feb 29", "2024-02-29T12:00:00.000Z");

    const res = await fetchWithClock(FEB_NOW.getTime(), "this_month");
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).toContain("Leap Feb 29");
  });

  it("non-leap year Feb: task on Mar 1 excluded from February", async () => {
    const FEB_NOW = new Date("2023-02-15T12:00:00.000Z");
    await seedTask("Mar 1 non-leap", "2023-03-01T00:00:00.000Z");
    await seedTask("Feb 28 task", "2023-02-28T23:59:59.999Z");

    const res = await fetchWithClock(FEB_NOW.getTime(), "this_month");
    expect(res.status).toBe(200);
    const titles = res.body.tasks.map((t) => t.title);
    expect(titles).toContain("Feb 28 task");
    expect(titles).not.toContain("Mar 1 non-leap");
  });

  it("today at UTC midnight boundary: task at 00:00:00.000 is today, not yesterday", async () => {
    const MIDNIGHT_NOW = new Date("2024-06-15T00:00:30.000Z");
    await seedTask("Midnight task", "2024-06-15T00:00:00.000Z");
    await seedTask("Pre-midnight", "2024-06-14T23:59:59.999Z");

    const res = await fetchWithClock(MIDNIGHT_NOW.getTime(), "today");
    expect(res.status).toBe(200);
    const titles = res.body.tasks.map((t) => t.title);
    expect(titles).toContain("Midnight task");
    expect(titles).not.toContain("Pre-midnight");
  });

  it("this_week when week crosses year boundary (Dec 30 Mon → Jan 5 Sun)", async () => {
    // Mon Dec 30, 2024 is getUTCDay()=1 → week = [Dec 30, Jan 6)
    const NOW = new Date("2025-01-02T12:00:00.000Z"); // Thursday Jan 2
    // getUTCDay()=4 → daysSinceMonday=3 → start=Dec 30
    await seedTask("Dec 31", "2024-12-31T12:00:00.000Z");
    await seedTask("Jan 2", "2025-01-02T10:00:00.000Z");
    await seedTask("Dec 29", "2024-12-29T23:59:59.999Z"); // previous week

    const res = await fetchWithClock(NOW.getTime(), "this_week");
    expect(res.status).toBe(200);
    const titles = res.body.tasks.map((t) => t.title);
    expect(titles).toContain("Dec 31");
    expect(titles).toContain("Jan 2");
    expect(titles).not.toContain("Dec 29");
  });

  it("all_time preserves user isolation", async () => {
    const OTHER_USER = "other-user-b16";
    await getTask().collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: "My task",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        completedAt: null,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Other user task",
        description: "d",
        userId: OTHER_USER,
        status: "pending",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        completedAt: null,
      },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER);

    expect(res.status).toBe(200);
    const titles = res.body.tasks.map((t) => t.title);
    expect(titles).toContain("My task");
    expect(titles).not.toContain("Other user task");
  });
});
