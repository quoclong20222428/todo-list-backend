/**
 * globalSetup.js — Runs once in the main process before any Vitest worker starts.
 *
 * Starts mongodb-memory-server and writes its URI to process.env so it is
 * inherited by every worker fork. This happens before any test module is
 * imported, preventing any accidental connection to a real MongoDB instance.
 */
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod;

export async function setup() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // Pass the in-memory URI to all child workers via environment.
  process.env.TEST_MONGO_URI = uri;

  // Suppress the production HTTP listener.
  process.env.VERCEL = "1";

  // Use isolated fake Clerk credentials — NOT from the committed .env file.
  // These values are intentionally invalid for a real Clerk account so that
  // the real requireAuth() middleware rejects all tokens, which is the
  // desired behaviour for B01 (auth enforcement tests).
  process.env.CLERK_SECRET_KEY = "sk_test_ISOLATED_FAKE_KEY_DO_NOT_USE_IN_PRODUCTION";
  process.env.CLERK_PUBLISHABLE_KEY = "pk_test_ISOLATED_FAKE_KEY_DO_NOT_USE_IN_PRODUCTION";
}

export async function teardown() {
  if (mongod) {
    await mongod.stop();
  }
}
