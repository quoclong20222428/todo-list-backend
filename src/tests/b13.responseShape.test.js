/**
 * B13 — HTTP response contract tests
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * Verifies that the shape of each endpoint's success response matches the
 * documented API contract and is stable:
 *
 *   POST /api/tasks → 201
 *     Required: _id (string), title, description, status ("pending"),
 *               userId, createdAt (string), updatedAt (string)
 *     Nullable:  completedAt (null by default)
 *
 *   GET /api/tasks?filter=all_time → 200
 *     Required top-level keys: tasks (Array), pendingCount, inProgressCount,
 *                              completedCount
 *     Empty-list case: same structure with tasks=[] and all counts=0.
 *     Each task object includes: _id, title, description, status, userId,
 *                                createdAt, updatedAt, completedAt
 *
 *   DELETE /api/tasks/:id → 200
 *     Body: { message: "Task deleted" }
 *
 * WHAT IS NOT TESTED:
 *   - Count accuracy across users (B07).
 *   - completedAt transition logic (B08, B09, B12).
 *   - Error response shapes (B04, B11).
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
const USER = "test-user-b13";

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

// ─── POST /api/tasks ─────────────────────────────────────────────────────────

describe("B13-1 — POST /api/tasks response shape", () => {
  it("201 response includes all required fields with correct types and defaults", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({ title: "Shape test", description: "Checking fields" });

    expect(res.status).toBe(201);
    const body = res.body;

    // Identity
    expect(body).toHaveProperty("_id");
    expect(typeof body._id).toBe("string");

    // Payload echoed back
    expect(body.title).toBe("Shape test");
    expect(body.description).toBe("Checking fields");

    // Defaults
    expect(body.status).toBe("pending");

    // Ownership
    expect(body.userId).toBe(USER);

    // Timestamps (Mongoose { timestamps: true })
    expect(body).toHaveProperty("createdAt");
    expect(typeof body.createdAt).toBe("string"); // JSON-serialised ISO date
    expect(body).toHaveProperty("updatedAt");
    expect(typeof body.updatedAt).toBe("string");

    // Nullable completedAt defaults to null
    expect(body).toHaveProperty("completedAt");
    expect(body.completedAt).toBeNull();
  });
});

// ─── GET /api/tasks ──────────────────────────────────────────────────────────

describe("B13-2 — GET /api/tasks response shape", () => {
  it("B13-2a: empty list — all required top-level keys present, counts are zero", async () => {
    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER);

    expect(res.status).toBe(200);
    const body = res.body;

    expect(body).toHaveProperty("tasks");
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(body.tasks).toHaveLength(0);

    expect(body).toHaveProperty("pendingCount");
    expect(body.pendingCount).toBe(0);

    expect(body).toHaveProperty("inProgressCount");
    expect(body.inProgressCount).toBe(0);

    expect(body).toHaveProperty("completedCount");
    expect(body.completedCount).toBe(0);
  });

  it("B13-2b: non-empty list — counts match seeded distribution (1 pending, 1 inprogress, 2 completed)", async () => {
    await getTask().create([
      { title: "p1",  description: "d", userId: USER, status: "pending"    },
      { title: "ip1", description: "d", userId: USER, status: "inprogress" },
      { title: "c1",  description: "d", userId: USER, status: "completed"  },
      { title: "c2",  description: "d", userId: USER, status: "completed"  },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER);

    expect(res.status).toBe(200);
    const body = res.body;

    expect(body.tasks).toHaveLength(4);
    expect(body.pendingCount).toBe(1);
    expect(body.inProgressCount).toBe(1);
    expect(body.completedCount).toBe(2);
  });

  it("B13-2c: each task object in the array includes the expected fields", async () => {
    await getTask().create({
      title: "Field check task",
      description: "Testing field presence",
      userId: USER,
      status: "pending",
    });

    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER);

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);

    const task = res.body.tasks[0];
    expect(task).toHaveProperty("_id");
    expect(task).toHaveProperty("title");
    expect(task).toHaveProperty("description");
    expect(task).toHaveProperty("status");
    expect(task).toHaveProperty("userId");
    expect(task).toHaveProperty("createdAt");
    expect(task).toHaveProperty("updatedAt");
    // completedAt must be present (null for non-completed tasks)
    expect(task).toHaveProperty("completedAt");
    expect(task.completedAt).toBeNull();
  });

  it("B13-2d: tasks are sorted newest-first (createdAt descending)", async () => {
    /**
     * The controller uses { $sort: { createdAt: -1 } } in the aggregate
     * pipeline, so the most recently created task should appear first.
     *
     * DETERMINISM:
     *   Using insertMany with explicit, distinct createdAt values avoids
     *   reliance on wall-clock timing or arbitrary delays (setTimeout).
     *   The older document is inserted second to confirm that sort order
     *   is driven by createdAt, not by insertion order.
     */
    const olderCreatedAt = new Date("2024-01-01T10:00:00.000Z");
    const newerCreatedAt = new Date("2024-06-01T10:00:00.000Z");

    const olderOid = new mongoose.Types.ObjectId();
    const newerOid = new mongoose.Types.ObjectId();

    // Insert newer document first, then older — sort must be by createdAt, not insertion order
    await getTask().collection.insertMany([
      {
        _id: newerOid,
        title: "Newer task",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: newerCreatedAt,
        updatedAt: newerCreatedAt,
        completedAt: null,
      },
      {
        _id: olderOid,
        title: "Older task",
        description: "d",
        userId: USER,
        status: "pending",
        createdAt: olderCreatedAt,
        updatedAt: olderCreatedAt,
        completedAt: null,
      },
    ]);

    const res = await request(app)
      .get("/api/tasks?filter=all_time")
      .set("X-Test-User-Id", USER);

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(2);

    const ids = res.body.tasks.map((t) => t._id.toString());
    // Newer task (June) must appear before older task (January)
    expect(ids[0]).toBe(newerOid.toString());
    expect(ids[1]).toBe(olderOid.toString());
  });
});

// ─── DELETE /api/tasks/:id ───────────────────────────────────────────────────

describe("B13-3 — DELETE /api/tasks/:id response shape", () => {
  it("successful delete → 200 with { message: 'Task deleted' }", async () => {
    const task = await getTask().create({
      title: "To be deleted",
      description: "Goodbye",
      userId: USER,
      status: "pending",
    });

    const res = await request(app)
      .delete(`/api/tasks/${task._id}`)
      .set("X-Test-User-Id", USER);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toBe("Task deleted");
  });
});
