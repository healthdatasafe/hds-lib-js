/**
 * Set of Misc utilities
 */

module.exports = {
  deepFreeze,
  waitUntilFalse
};

/**
 * Timed semaphore
 */
async function waitUntilFalse (callBackToReturnFalse, maxWaitMs = 5000) {
  const started = Date.now();
  while (callBackToReturnFalse()) {
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    if (Date.now() - started > maxWaitMs) throw new Error(`Timeout after ${maxWaitMs}ms`);
  }
}

/**
 * Recursively make immutable an object
 * @param {*} object
 * @returns {*}
 */
function deepFreeze (object) {
  // Retrieve the property names defined on object
  const propNames = Reflect.ownKeys(object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = object[name];

    if ((value && typeof value === 'object') || typeof value === 'function') {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}
