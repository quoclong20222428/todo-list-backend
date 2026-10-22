import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // globalSetup runs once in the main process BEFORE any worker starts,
    // ensuring the memory-server URI is available via environment before
    // server.js or Mongoose is ever imported.
    globalSetup: ["./src/tests/globalSetup.js"],
    // setupFiles run inside each worker before the test module is executed.
    setupFiles: ["./src/tests/setup.js"],
    // No JSDOM needed for backend tests.
    environment: "node",
    // isolate: false — all test files share one module registry per worker.
    // This prevents OverwriteModelError: Mongoose's model() call in
    // tasksModel.js is only executed once, since the module is loaded into
    // the shared registry on first import and cached for all subsequent files.
    // Note: clearMocks and restoreMocks still apply per-test via vi.clearMocks().
    isolate: false,
    // Keep the default forks pool. With isolate:false, each fork still gets
    // one shared module context, which is what we need.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Sequential file execution to prevent concurrent Mongoose operations
    // across files within the same fork.
    sequence: {
      concurrent: false,
    },
  },
});
