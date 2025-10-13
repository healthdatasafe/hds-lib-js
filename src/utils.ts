/**
 * Set of Misc utilities
 */

/**
 * Timed semaphore
 */
export async function waitUntilFalse (callBackToReturnFalse: () => boolean, maxWaitMs: number = 5000): Promise<void> {
  const started = Date.now();
  while (callBackToReturnFalse()) {
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    if (Date.now() - started > maxWaitMs) throw new Error(`Timeout after ${maxWaitMs}ms`);
  }
}

/**
 * Recursively make immutable an object
 */
export function deepFreeze<T extends object> (object: T): T {
  // Retrieve the property names defined on object
  const propNames = Reflect.ownKeys(object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = (object as any)[name];

    if ((value && typeof value === 'object') || typeof value === 'function') {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}
