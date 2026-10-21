/**
 * setup.js — Runs inside every Vitest worker before the test module is loaded.
 *
 * Safety guarantee: reads TEST_MONGO_URI (set by globalSetup) and applies it
 * as DB_URL. If TEST_MONGO_URI is missing or looks like a real Atlas connection
 * string, this file throws immediately so no test can accidentally connect to
 * production MongoDB.
 */

const uri = process.env.TEST_MONGO_URI;

if (!uri) {
  throw new Error(
    "[test/setup] TEST_MONGO_URI is not set. " +
      "globalSetup must have failed to start mongodb-memory-server. " +
      "Refusing to run tests without an isolated database."
  );
}

if (uri.includes("mongodb.net") || uri.includes("atlas")) {
  throw new Error(
    "[test/setup] TEST_MONGO_URI appears to point to a remote/Atlas instance. " +
      "Tests must use mongodb-memory-server only. Aborting."
  );
}

// Apply the in-memory URI as the database connection string.
process.env.DB_URL = uri;

// Suppress the production HTTP listener.
process.env.VERCEL = "1";

// Isolated fake Clerk credentials (same as globalSetup — belt-and-suspenders).
if (!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_ISOLATED")) {
  process.env.CLERK_SECRET_KEY = "sk_test_ISOLATED_FAKE_KEY_DO_NOT_USE_IN_PRODUCTION";
  process.env.CLERK_PUBLISHABLE_KEY = "pk_test_ISOLATED_FAKE_KEY_DO_NOT_USE_IN_PRODUCTION";
}
