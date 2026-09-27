// Excerpt copied from the Bible Journal web app (bible-journal-app/src/lib/entry-filter-rules.ts) on 2026-09-27:
// only monthName, weekdayName, weekdayPlural and EntryFacet, the pieces graph-filter-rules.ts imports.
// The rest of the original is Home's filter and its imports, which the plugin has no use for.
// Each piece is unchanged. Keep in step with the original rather than editing here.

/**
 * A month's name, in the reader's own language.
 *
 * Pinned to UTC and built on an arbitrary non-leap year, so this is a name
 * lookup and never a date calculation -- the same trick `formatWall` uses in
 * `entry-list-rules.ts`. The reader's locale rather than a hard-coded English
 * list, because the month *column* of the list beside it is formatted that way
 * too, and a chip reading "August" next to a row reading "août" would be the
 * filter disagreeing with what it filtered.
 */
export function monthName(month: number, style: "long" | "short"): string {
  return new Date(Date.UTC(2021, month - 1, 1)).toLocaleDateString(undefined, {
    month: style,
    timeZone: "UTC",
  });
}

/**
 * A weekday's name, in the reader's own language.
 *
 * 1 January 2023 was a Sunday, which is what makes `1 + weekday` land on the
 * day `Date.getDay()` calls `weekday`.
 */
export function weekdayName(weekday: number, style: "long" | "short"): string {
  return new Date(Date.UTC(2023, 0, 1 + weekday)).toLocaleDateString(
    undefined,
    { weekday: style, timeZone: "UTC" },
  );
}

/**
 * "Mondays" -- the plural the wireframe puts on the active-filter chip, because
 * the filter means every Monday and not one of them.
 *
 * **The `s` is English, bolted onto a name that is not.** Every other word this
 * app puts on screen is hard-coded English, so the mixture is only visible to a
 * reader whose device is set to another language, and only on this one chip.
 * Naming it here rather than leaving it to be discovered.
 */
export function weekdayPlural(weekday: number): string {
  return `${weekdayName(weekday, "long")}s`;
}

/**
 * One entry reduced to the five things it can be filtered on.
 *
 * This is what the panel needs to know which chips are worth offering, and it
 * is deliberately five small values rather than the entry: the whole journal's
 * worth of these is sent to the browser, and the panel has to answer
 * "would ticking this find anything" without another round trip.
 */
export type EntryFacet = {
  year: number;
  month: number;
  weekday: number;
  hasVerses: boolean;
  hasTags: boolean;
};
