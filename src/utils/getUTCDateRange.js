/**
 * getUTCDateRange — Compute UTC calendar boundaries for date filters.
 *
 * All boundaries use UTC methods exclusively (Date.UTC, getUTCFullYear, etc.)
 * so the result is completely independent of the host's local timezone.
 *
 * Returns half-open intervals: [startDate, endDate)
 *
 * @param {string} filter  "today" | "this_week" | "this_month" | "all_time"
 * @param {Date}   [now]   Reference instant (defaults to current time).
 *                         Accepts a deterministic value for testing.
 * @returns {{ startDate: Date | null, endDate: Date | null }}
 */
export function getUTCDateRange(filter, now = new Date()) {
  switch (filter) {
    case "today": {
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth();
      const d = now.getUTCDate();
      const startDate = new Date(Date.UTC(y, m, d));
      const endDate = new Date(Date.UTC(y, m, d + 1));
      return { startDate, endDate };
    }

    case "this_week": {
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth();
      const d = now.getUTCDate();
      const utcDay = now.getUTCDay(); // 0 = Sunday
      // Shift to Monday-based: Monday=0, Sunday=6
      const daysSinceMonday = utcDay === 0 ? 6 : utcDay - 1;
      const startDate = new Date(Date.UTC(y, m, d - daysSinceMonday));
      const endDate = new Date(Date.UTC(y, m, d - daysSinceMonday + 7));
      return { startDate, endDate };
    }

    case "this_month": {
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth();
      const startDate = new Date(Date.UTC(y, m, 1));
      // Date.UTC(y, m+1, 1) correctly handles Dec→Jan rollover and months
      // of varying length including Feb on leap years.
      const endDate = new Date(Date.UTC(y, m + 1, 1));
      return { startDate, endDate };
    }

    case "all_time":
    default:
      return { startDate: null, endDate: null };
  }
}
