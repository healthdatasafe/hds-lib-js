/**
 * While developping this lib some functionnalities should be
 * added to pyv js-lib in a second step
 */
const pryv = require('pryv');
require('@pryv/monitor')(pryv);
require('@pryv/socket.io')(pryv);

// patch Pryv only if needed.
if (!pryv.Connection.prototype.apiOne) {
/**
 * Make one api Api call
 * @param {string} method - methodId
 * @param {object} [params] - the method associated with this result
 * @param {string} [resultKey] - if given, returns the value or throws an error if not present
 * @throws {Error} if .error is present the response
 */
  pryv.Connection.prototype.apiOne = async function apiOne (method, params = {}, expectedKey) {
    const result = await this.api([{ method, params }]);
    if (result[0] == null || result[0].error || (expectedKey != null && result[0][expectedKey] == null)) {
      const innerObject = result[0]?.error || result;
      const error = new Error(`Error for api method: "${method}" with params: ${JSON.stringify(params)} >> Result: ${JSON.stringify(innerObject)}"`);
      error.innerObject = innerObject;
      throw error;
    }
    if (expectedKey != null) return result[0][expectedKey];
    return result[0];
  };

  /**
   * Revoke : Delete the accessId
   * - Do not thow error if access is already revoked, just return null;
   * @param {boolean} [throwOnFail = true] - if set to false do not throw Error on failure
   * @param {Connection} [usingConnection] - specify which connection issues the revoke, might be necessary when selfRovke
   */
  pryv.Connection.prototype.revoke = async function revoke (throwOnFail = true, usingConnection) {
    usingConnection = usingConnection || this;
    let accessInfo = null;
    // get accessId
    try {
      accessInfo = await this.accessInfo();
    } catch (e) {
      if (e.response?.body?.error?.id === 'invalid-access-token') {
        return null; // Already revoked OK..
      }
      if (throwOnFail) throw e;
      return null;
    }
    // delete access
    try {
      const result = usingConnection.apiOne('accesses.delete', { id: accessInfo.id });
      return result;
    } catch (e) {
      if (throwOnFail) throw e;
      return null;
    }
  };
}

module.exports = pryv;
