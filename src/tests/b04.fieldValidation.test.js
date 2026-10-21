/**
 * B04 — Create-task required-field validation
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * The controller creates a Task object from req.body and calls .save().
 * Mongoose schema validation catches missing required fields and returns 400.
 * There is no HTTP-layer validation (e.g. express-validator) — errors reach
 * the client as Mongoose validation message strings.
 *
 * Verifies:
 *   - Empty body → HTTP 400 with message string
 *   - Missing title → HTTP 400
 *   - Missing description → HTTP 400
 *   - Valid title + description → HTTP 201 with persisted document
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

const USER = "test-user-b04";

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

describe("B04 — Create-task field validation (mocked auth)", () => {
  it("empty body → 400 with message", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
    expect(typeof res.body.message).toBe("string");
  });

  it("missing title → 400", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({ description: "some description" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  it("missing description → 400", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({ title: "some title" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  it("empty string title → 400 (Mongoose required rejects empty string)", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({ title: "", description: "desc" });

    expect(res.status).toBe(400);
  });

  it("valid title + description → 201 with persisted document", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", USER)
      .send({ title: "My task", description: "My description" });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("_id");
    expect(res.body.title).toBe("My task");
    expect(res.body.description).toBe("My description");
    expect(res.body.status).toBe("pending");
    expect(res.body.userId).toBe(USER);

    // Verify persisted
    const doc = await getTask().findById(res.body._id);
    expect(doc).not.toBeNull();
    expect(doc.title).toBe("My task");
  });
});
