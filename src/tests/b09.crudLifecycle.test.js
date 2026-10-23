/**
 * B09 — Full CRUD lifecycle
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * Verifies end-to-end request/response round-trips for each CRUD operation:
 *   - POST creates a task that subsequently appears in GET /api/tasks
 *   - PUT updates title/description; changes persist and are confirmed by GET
 *   - Full status cycle: pending → inprogress → completed → pending,
 *     with completedAt transitions verified via a follow-up GET after each PUT
 *   - DELETE removes the task; it no longer appears in a subsequent GET
 *
 * WHAT IS NOT TESTED:
 *   - Real Clerk token validation (B01).
 *   - Field validation errors (B04).
 *   - Cross-user protection (B03).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import {
  createTestApp,
  connectTestDB,
  disconnectTestDB,
  clearTasks,
} from "./helpers/createTestApp.js";

const USER = "test-user-b09";

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

// ─── helpers ────────────────────────────────────────────────────────────────

/** Create a task via POST and return the 201 response body. */
async function postTask(title = "Test task", description = "Test desc") {
  const res = await request(app)
    .post("/api/tasks")
    .set("X-Test-User-Id", USER)
    .send({ title, description });
  expect(
    res.status,
    `POST /api/tasks returned ${res.status}: ${JSON.stringify(res.body)}`
  ).toBe(201);
  return res.body;
}

/** GET all tasks for USER (filter=all_time) and return the parsed body. */
async function getAllTasks() {
  const res = await request(app)
    .get("/api/tasks?filter=all_time")
    .set("X-Test-User-Id", USER);
  expect(res.status).toBe(200);
  return res.body;
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("B09 — Full CRUD lifecycle (mocked auth)", () => {
  it("B09-1: created task appears in subsequent GET list", async () => {
    const created = await postTask("Lifecycle task", "Lifecycle desc");

    const { tasks } = await getAllTasks();
    const found = tasks.find((t) => t._id === created._id);

    expect(found, "Created task not found in GET response").toBeDefined();
    expect(found.title).toBe("Lifecycle task");
    expect(found.description).toBe("Lifecycle desc");
    expect(found.status).toBe("pending");
  });

  it("B09-2: deleted task no longer appears in GET list", async () => {
    const created = await postTask("Delete me", "Gone soon");

    // Confirm it appears before deletion
    const before = await getAllTasks();
    expect(before.tasks.some((t) => t._id === created._id)).toBe(true);

    const delRes = await request(app)
      .delete(`/api/tasks/${created._id}`)
      .set("X-Test-User-Id", USER);
    expect(delRes.status).toBe(200);

    // Confirm it is absent after deletion
    const after = await getAllTasks();
    expect(after.tasks.some((t) => t._id === created._id)).toBe(false);
  });

  it("B09-3: updated title and description persist and are returned by GET", async () => {
    const created = await postTask("Original title", "Original desc");

    const putRes = await request(app)
      .put(`/api/tasks/${created._id}`)
      .set("X-Test-User-Id", USER)
      .send({ title: "Updated title", description: "Updated desc" });

    expect(putRes.status).toBe(200);
    expect(putRes.body.title).toBe("Updated title");
    expect(putRes.body.description).toBe("Updated desc");

    // Verify via a fresh GET
    const { tasks } = await getAllTasks();
    const found = tasks.find((t) => t._id === created._id);
    expect(found, "Updated task not found in GET response").toBeDefined();
    expect(found.title).toBe("Updated title");
    expect(found.description).toBe("Updated desc");
  });

  it("B09-4: full status cycle — completedAt set and cleared, confirmed by GET after each step", async () => {
    const created = await postTask("Status cycling task", "Will cycle");

    // pending → inprogress: completedAt must remain null
    let res = await request(app)
      .put(`/api/tasks/${created._id}`)
      .set("X-Test-User-Id", USER)
      .send({ status: "inprogress" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("inprogress");
    expect(res.body.completedAt).toBeNull();

    let { tasks } = await getAllTasks();
    let found = tasks.find((t) => t._id === created._id);
    expect(found.status).toBe("inprogress");
    expect(found.completedAt).toBeNull();

    // inprogress → completed: completedAt must be set to a server timestamp
    const before = Date.now();
    res = await request(app)
      .put(`/api/tasks/${created._id}`)
      .set("X-Test-User-Id", USER)
      .send({ status: "completed" });
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.completedAt).not.toBeNull();

    const completedAtMs = new Date(res.body.completedAt).getTime();
    expect(completedAtMs).toBeGreaterThanOrEqual(before);
    expect(completedAtMs).toBeLessThanOrEqual(after);

    // Confirm via GET
    ({ tasks } = await getAllTasks());
    found = tasks.find((t) => t._id === created._id);
    expect(found.status).toBe("completed");
    expect(found.completedAt).not.toBeNull();

    // completed → pending: completedAt must be cleared to null
    res = await request(app)
      .put(`/api/tasks/${created._id}`)
      .set("X-Test-User-Id", USER)
      .send({ status: "pending" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(res.body.completedAt).toBeNull();

    // Confirm via GET
    ({ tasks } = await getAllTasks());
    found = tasks.find((t) => t._id === created._id);
    expect(found.status).toBe("pending");
    expect(found.completedAt).toBeNull();
  });
});
