"use strict";
/**
 * ISO 8601 duration parser and formatter.
 * Supports: P{n}D, P{n}W, P{n}M, P{n}Y, and combinations like P1Y6M.
 * Month = 30 days, Year = 365 days (approximation sufficient for reminder logic).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.durationToSeconds = durationToSeconds;
exports.durationToLabel = durationToLabel;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_WEEK = 604800;
const SECONDS_PER_MONTH = 2592000; // 30 days
const SECONDS_PER_YEAR = 31536000; // 365 days
const durationRegex = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/;
/**
 * Parse an ISO 8601 duration string to seconds.
 * @throws if the string is not a valid duration
 */
function durationToSeconds(iso) {
    const m = durationRegex.exec(iso);
    if (!m)
        throw new Error(`Invalid ISO 8601 duration: "${iso}"`);
    const [, years, months, weeks, days, hours, minutes] = m;
    let total = 0;
    if (years)
        total += parseInt(years) * SECONDS_PER_YEAR;
    if (months)
        total += parseInt(months) * SECONDS_PER_MONTH;
    if (weeks)
        total += parseInt(weeks) * SECONDS_PER_WEEK;
    if (days)
        total += parseInt(days) * SECONDS_PER_DAY;
    if (hours)
        total += parseInt(hours) * SECONDS_PER_HOUR;
    if (minutes)
        total += parseInt(minutes) * 60;
    if (total === 0)
        throw new Error(`Duration is zero: "${iso}"`);
    return total;
}
/**
 * Format seconds as a human-readable duration label.
 */
function durationToLabel(seconds) {
    if (seconds >= SECONDS_PER_YEAR) {
        const n = Math.round(seconds / SECONDS_PER_YEAR);
        return n === 1 ? '1 year' : `${n} years`;
    }
    if (seconds >= SECONDS_PER_MONTH) {
        const n = Math.round(seconds / SECONDS_PER_MONTH);
        return n === 1 ? '1 month' : `${n} months`;
    }
    if (seconds >= SECONDS_PER_WEEK) {
        const n = Math.round(seconds / SECONDS_PER_WEEK);
        return n === 1 ? '1 week' : `${n} weeks`;
    }
    if (seconds >= SECONDS_PER_DAY) {
        const n = Math.round(seconds / SECONDS_PER_DAY);
        return n === 1 ? '1 day' : `${n} days`;
    }
    if (seconds >= SECONDS_PER_HOUR) {
        const n = Math.round(seconds / SECONDS_PER_HOUR);
        return n === 1 ? '1 hour' : `${n} hours`;
    }
    const n = Math.round(seconds / 60);
    return n === 1 ? '1 minute' : `${n} minutes`;
}
