/**
 * B11 — Update edge cases
 *
 * AUTHENTICATION: Mocked (X-Test-User-Id header → req.auth.userId).
 *
 * Verifies PUT /api/tasks/:id error-path behavior:
 *
 * B11-1: Invalid status enum value
 *   The controller calls task.save() after assigning req.body.status.
 *   Mongoose schema validation (enum: ["pending","inprogress","completed"])
 *   rejects the value and throws a ValidationError, which is caught by the
 *   controller's catch block → 400.
 *
 * B11-2: Valid ObjectId format, no matching document
 *   Task.findOne({ _id, userId }) returns null; controller returns 404.
 *
 * B11-3: Malformed ObjectId (not a valid MongoDB ObjectId string)
 *   Task.findOne() throws a Mongoose CastError before touching the database.
 *   The controller's catch block catches it → 400.
 *
 *   DEFECT NOTE: If the observed status is 500 instead of 400, this indicates
 *   the CastError is escaping the try/catch (e.g. Express 5 async error
 *   propagation). In that case the test will fail with a descriptive message
 *   and the behavior should be reported as a defect without modifying
 *   production code.
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
const USER = "test-user-b11";

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

describe("B11 — Update edge cases (mocked auth)", () => {
  it("B11-1: PUT with invalid status value → 400 (Mongoose enum validation)", async () => {
    const task = await getTask().create({
      title: "Valid task",
      description: "desc",
      userId: USER,
      status: "pending",
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("X-Test-User-Id", USER)
      .send({ status: "not-a-valid-status" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
    expect(typeof res.body.message).toBe("string");
  });

  it("B11-2: PUT with valid ObjectId format but no matching document → 404", async () => {
    const nonExistentId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .put(`/api/tasks/${nonExistentId}`)
      .set("X-Test-User-Id", USER)
      .send({ title: "Should not work" });

    expect(
      res.status,
      `Expected 404 but got ${res.status}: ${JSON.stringify(res.body)}`
    ).toBe(404);
    expect(res.body).toHaveProperty("message");
  });

  it("B11-3: PUT with malformed ObjectId → 400 (Mongoose CastError caught by controller)", async () => {
    /**
     * The updateTask controller catch block:
     *   catch (error) { res.status(400).json({ message: error.message }) }
     *
     * A Mongoose CastError thrown by Task.findOne({ _id: "not-valid-id" })
     * is caught here, producing HTTP 400.
     *
     * If the actual status is 500, Express 5's async error handler has taken
     * over — report as a defect, do not adjust the assertion.
     */
    const res = await request(app)
      .put("/api/tasks/not-a-valid-objectid")
      .set("X-Test-User-Id", USER)
      .send({ title: "Malformed ID test" });

    expect(
      res.status,
      `Expected 400 (CastError caught by controller) but got ${res.status}: ${JSON.stringify(res.body)}`
    ).toBe(400);
    expect(res.body).toHaveProperty("message");
    expect(typeof res.body.message).toBe("string");
  });
});
