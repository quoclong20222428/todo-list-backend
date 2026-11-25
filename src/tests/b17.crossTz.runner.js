/**
 * Cross-timezone verification runner.
 *
 * Spawns the full Vitest suite under multiple TZ environments and verifies
 * that all tests pass identically regardless of host timezone.
 *
 * Usage:  node src/tests/b17.crossTz.runner.js
 *
 * This script is NOT a Vitest test file. It is a standalone Node.js script
 * that runs `npx vitest run` in child processes with different TZ values.
 *
 * SUCCESS CRITERIA (per timezone):
 *   - Exit code 0
 *   - Vitest summary line is present and parseable
 *   - failed === 0
 *   - skipped === 0
 *   - passed === total
 *   - total > 0
 *   - passed and total match the baseline (first successful run)
 *
 * EXIT CODE:
 *   0 — all timezones pass and produce identical results
 *   1 — any timezone failed, produced missing/unparseable summary,
 *       had failures/skips, or differed from the baseline
 */

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");

const TIMEZONES = [
  "UTC",
  "America/New_York",    // UTC-5 / UTC-4
  "Asia/Ho_Chi_Minh",   // UTC+7
  "Asia/Tokyo",          // UTC+9
  "Pacific/Kiritimati",  // UTC+14 (most positive)
  "America/Los_Angeles", // UTC-8 / UTC-7
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip ANSI escape codes from a string.
 * @param {string} s
 * @returns {string}
 */
function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Parse the Vitest summary line from stripped output.
 *
 * Vitest v5 all-pass format:
 *   "      Tests  120 passed (120)"
 *
 * Vitest v5 partial-failure format:
 *   "      Tests  119 passed | 1 failed (120)"
 *
 * @param {string} stripped  ANSI-stripped output
 * @returns {{ passed: number, failed: number, skipped: number, total: number } | null}
 *   Returns null if the summary line is not found or not parseable.
 */
function parseSummary(stripped) {
  // Find the Tests summary line.
  const lineMatch = stripped.match(/Tests\s+(.*)\((\d+)\)/);
  if (!lineMatch) return null;

  const segment = lineMatch[1]; // e.g. "120 passed " or "119 passed | 1 failed "
  const total = parseInt(lineMatch[2], 10);

  const passedMatch = segment.match(/(\d+)\s+passed/);
  const failedMatch = segment.match(/(\d+)\s+failed/);
  const skippedMatch = segment.match(/(\d+)\s+skipped/);

  if (!passedMatch) return null; // malformed — treat as error

  return {
    passed:  parseInt(passedMatch[1],  10),
    failed:  failedMatch  ? parseInt(failedMatch[1],  10) : 0,
    skipped: skippedMatch ? parseInt(skippedMatch[1], 10) : 0,
    total,
  };
}

// ─── Run each timezone ────────────────────────────────────────────────────────

/**
 * @typedef {{ tz: string, passed: number, failed: number, skipped: number,
 *             total: number, ok: boolean, reason: string }} TzResult
 */

/** @type {TzResult[]} */
const results = [];

for (const tz of TIMEZONES) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Running tests with TZ=${tz}`);
  console.log("=".repeat(60));

  let output = "";
  let exitOk = false;

  try {
    output = execSync("npx vitest run 2>&1", {
      cwd: projectRoot,
      env: { ...process.env, TZ: tz },
      encoding: "utf-8",
      timeout: 120_000,
    });
    exitOk = true;
  } catch (err) {
    // execSync throws when exit code is non-zero; stdout is on err.stdout.
    output = err.stdout ?? err.message ?? "";
    exitOk = false;
  }

  const stripped = stripAnsi(output);
  const summary = parseSummary(stripped);

  // Evaluate this timezone's result.
  let ok = false;
  let reason = "";

  if (!exitOk) {
    reason = "non-zero exit code";
  } else if (!summary) {
    reason = "Vitest summary line not found in output";
  } else if (summary.total === 0) {
    reason = "no tests ran (total=0)";
  } else if (summary.failed > 0) {
    reason = `${summary.failed} test(s) failed`;
  } else if (summary.skipped > 0) {
    reason = `${summary.skipped} test(s) skipped`;
  } else if (summary.passed !== summary.total) {
    reason = `passed (${summary.passed}) ≠ total (${summary.total})`;
  } else {
    ok = true;
    reason = "ok";
  }

  const tzResult = {
    tz,
    passed:  summary?.passed  ?? 0,
    failed:  summary?.failed  ?? (exitOk ? 0 : -1),
    skipped: summary?.skipped ?? 0,
    total:   summary?.total   ?? 0,
    ok,
    reason,
  };

  results.push(tzResult);

  const icon = ok ? "✅" : "❌";
  if (summary) {
    console.log(
      `${icon} TZ=${tz}: ${summary.passed} passed, ${summary.failed} failed, ` +
      `${summary.skipped} skipped / ${summary.total} total` +
      (ok ? "" : `  ← ${reason}`)
    );
  } else {
    console.log(`${icon} TZ=${tz}: summary not found — exit ok=${exitOk}  ← ${reason}`);
    // Print the tail of output to aid debugging.
    const tail = output.slice(-600).trim();
    if (tail) console.log(tail);
  }
}

// ─── Summary table ────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log("SUMMARY");
console.log("=".repeat(60));

const COL = { tz: 25, passed: 8, failed: 8, skipped: 9, total: 7, result: 8 };
const header =
  `| ${"Timezone".padEnd(COL.tz)} | ${"Passed".padStart(COL.passed)} | ` +
  `${"Failed".padStart(COL.failed)} | ${"Skipped".padStart(COL.skipped)} | ` +
  `${"Total".padStart(COL.total)} | ${"Result".padEnd(COL.result)} |`;
const divider =
  `|-${"-".repeat(COL.tz)}-|-${"-".repeat(COL.passed)}-|` +
  `-${"-".repeat(COL.failed)}-|-${"-".repeat(COL.skipped)}-|` +
  `-${"-".repeat(COL.total)}-|-${"-".repeat(COL.result)}-|`;

console.log(header);
console.log(divider);

for (const r of results) {
  const result = r.ok ? "PASS" : `FAIL`;
  const row =
    `| ${r.tz.padEnd(COL.tz)} | ${String(r.passed).padStart(COL.passed)} | ` +
    `${String(r.failed).padStart(COL.failed)} | ${String(r.skipped).padStart(COL.skipped)} | ` +
    `${String(r.total).padStart(COL.total)} | ${result.padEnd(COL.result)} |`;
  console.log(row);
}

// ─── Consistency check ────────────────────────────────────────────────────────

const passing = results.filter((r) => r.ok);
const failing = results.filter((r) => !r.ok);

// All timezones must pass and produce identical counts.
let allConsistent = failing.length === 0;
if (allConsistent && passing.length > 1) {
  const baseline = passing[0];
  for (const r of passing.slice(1)) {
    if (r.passed !== baseline.passed || r.total !== baseline.total) {
      allConsistent = false;
      console.log(
        `\n❌ Inconsistent counts: TZ=${baseline.tz} has ${baseline.total} total ` +
        `but TZ=${r.tz} has ${r.total} total`
      );
    }
  }
}

console.log("");

if (failing.length > 0) {
  console.log("❌ FAILED TIMEZONES:");
  for (const r of failing) {
    console.log(`   TZ=${r.tz}  reason: ${r.reason}`);
  }
}

if (allConsistent && passing.length === TIMEZONES.length) {
  const baseline = passing[0];
  console.log(
    `✅ ALL ${TIMEZONES.length} TIMEZONES PRODUCED IDENTICAL RESULTS ` +
    `(${baseline.passed} passed / ${baseline.total} total each)`
  );
  process.exit(0);
} else {
  if (!allConsistent && failing.length === 0) {
    console.log("❌ TIMEZONES PRODUCED DIFFERENT TEST COUNTS — investigation needed");
  } else {
    console.log("❌ SOME TIMEZONES FAILED — investigation needed");
  }
  process.exit(1);
}
