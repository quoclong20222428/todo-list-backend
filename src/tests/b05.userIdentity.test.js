/**
 * B05 — Trusted user identity (userId binding)
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * createTask() sets userId: req.auth.userId — NOT from req.body.
 * This test verifies that a forged userId in the request body is ignored
 * and the persisted document belongs to the authenticated user.
 *
 * Verifies:
 *   - Created task.userId equals the token identity (req.auth.userId).
 *   - A forged userId in req.body does not override the identity.
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

const USER_A = "test-user-a-b05";
const FORGED_USER = "attacker-b05";

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

describe("B05 — Trusted user identity (mocked auth)", () => {
  it("task userId is bound to req.auth.userId, not req.body.userId", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER_A)
      .send({
        title: "My task",
        description: "My desc",
        userId: FORGED_USER, // Attempt to override — should be ignored
      });

    expect(res.status).toBe(201);

    // HTTP response
    expect(res.body.userId).toBe(USER_A);
    expect(res.body.userId).not.toBe(FORGED_USER);

    // Persisted document
    const doc = await getTask().findById(res.body._id);
    expect(doc).not.toBeNull();
    expect(doc.userId).toBe(USER_A);
    expect(doc.userId).not.toBe(FORGED_USER);
  });

  it("task created without forged userId also binds to authenticated user", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER_A)
      .send({ title: "Normal task", description: "desc" });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(USER_A);
  });
});
