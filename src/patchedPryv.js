/**
 * While developping this lib some functionnalities should be
 * added to pyv js-lib in a second step
 */
const pryv = require('pryv');

// patch Pryv only if needed.
if (!pryv.Connection.prototype.apiOne) {
/**
 * Make one api Api call
 * @param {string} method - methodId
 * @param {object} [params] - the method associated with this result
 * @param {string} [resultKey] - if given, returns the value or throws an error if not present
 * @throws {Error} if .error is present the response
 */
  pryv.Connection.prototype.apiOne = async function (method, params = {}, expectedKey) {
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
}
module.exports = pryv;
