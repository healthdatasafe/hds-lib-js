/**
 * Set of Misc utilities
 */
/**
 * Timed semaphore
 */
export declare function waitUntilFalse(callBackToReturnFalse: () => boolean, maxWaitMs?: number): Promise<void>;
/**
 * Recursively make immutable an object
 */
export declare function deepFreeze<T extends object>(object: T): T;
// # sourceMappingURL=utils.d.ts.map
