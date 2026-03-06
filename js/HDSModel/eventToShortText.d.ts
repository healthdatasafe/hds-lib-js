/**
 * Format a Unix timestamp (seconds) as a date string.
 * Centralized here so we can later hook into user locale/format preferences.
 */
export declare function formatEventDate(timeSec: number): string;
/**
 * Convert an event's content to a short human-readable string.
 * Resolves itemDef from the model (streamId + eventType match).
 *
 * With itemDef: select → localized option label, checkbox → "Yes",
 * number → "60 Kg" (with unit symbol from eventType extras),
 * datasource-search → drug label + intake details, date → ISO date.
 *
 * Without itemDef (fallback): derives unit from eventType symbol if available,
 * for object content produces short textual representation.
 */
export declare function eventToShortText(event: any): string | null;
//# sourceMappingURL=eventToShortText.d.ts.map