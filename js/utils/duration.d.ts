/**
 * ISO 8601 duration parser and formatter.
 * Supports: P{n}D, P{n}W, P{n}M, P{n}Y, and combinations like P1Y6M.
 * Month = 30 days, Year = 365 days (approximation sufficient for reminder logic).
 */
/**
 * Parse an ISO 8601 duration string to seconds.
 * @throws if the string is not a valid duration
 */
export declare function durationToSeconds(iso: string): number;
/**
 * Format seconds as a human-readable duration label.
 */
export declare function durationToLabel(seconds: number): string;
//# sourceMappingURL=duration.d.ts.map