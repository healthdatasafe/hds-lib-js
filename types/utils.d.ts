/**
 * Recursively make immutable an object
 * @param {*} object
 * @returns {*}
 */
export function deepFreeze(object: any): any;
/**
 * Timed semaphore
 */
export function waitUntilFalse(callBackToReturnFalse: () => boolean, maxWaitMs?: number): Promise<void>;
