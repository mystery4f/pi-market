/**
 * A skill that only says where it went. Sources keep these after moving content elsewhere, and
 * an agent that loads one is supposed to stop rather than improvise — so it is installed like any
 * other skill, flagged so `market_list` and `market_doctor` can say what it is.
 */
const MOVED_DESCRIPTION = /^["']?\s*moved to\b/i;
const MOVED_HEADING = /^#+[^\n]*\b(has moved|moved to)\b/i;

export function detectTombstone(description: string | undefined, body: string): boolean {
  if (description && MOVED_DESCRIPTION.test(description)) return true;

  const firstHeading = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("#"));
  return firstHeading !== undefined && MOVED_HEADING.test(firstHeading);
}
