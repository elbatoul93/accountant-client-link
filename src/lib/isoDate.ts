/** Today as YYYY-MM-DD in local time. Dates stored in the database must be ISO, never a display string. */
export const todayIso = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Normalise a date value to YYYY-MM-DD for a `date` column, or null when it is not a usable date.
 * Accepts ISO dates and timestamps, and the day/month/year strings that older browser data may hold.
 */
export const toIsoDay = (s: string | null | undefined): string | null => {
  if (!s) return null;
  const v = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
};
