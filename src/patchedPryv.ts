/**
 * While developing this lib some functionalities should be
 * added to pryv js-lib in a second step
 */

import * as pryv from 'pryv';
import { default as monitor }  from '@pryv/monitor';
import { default as socketIo } from '@pryv/socket.io';
console.log(pryv.utils);
monitor(pryv);
socketIo(pryv);

// patch Pryv only if needed.
if (!(pryv.Connection.prototype as any).apiOne) {
  /**
   * Make one api Api call
   */
  (pryv.Connection.prototype as any).apiOne = async function apiOne (method: string, params: any = {}, expectedKey?: string): Promise<any> {
    const result = await this.api([{ method, params }]);
    if (result[0] == null || result[0].error || (expectedKey != null && result[0][expectedKey] == null)) {
      const innerObject = result[0]?.error || result;
      const error = new Error(`Error for api method: "${method}" with params: ${JSON.stringify(params)} >> Result: ${JSON.stringify(innerObject)}"`);
      (error as any).innerObject = innerObject;
      throw error;
    }
    if (expectedKey != null) return result[0][expectedKey];
    return result[0];
  };

  /**
   * Revoke : Delete the accessId
   * - Do not throw error if access is already revoked, just return null;
   */
  (pryv.Connection.prototype as any).revoke = async function revoke (throwOnFail: boolean = true, usingConnection?: pryv.Connection): Promise<any> {
    usingConnection = usingConnection || this;
    let accessInfo: any = null;
    // get accessId
    try {
      accessInfo = await this.accessInfo();
    } catch (e: any) {
      if (e.response?.body?.error?.id === 'invalid-access-token') {
        return null; // Already revoked OK..
      }
      if (throwOnFail) throw e;
      return null;
    }
    // delete access
    try {
      const result = (usingConnection as any).apiOne('accesses.delete', { id: accessInfo.id });
      return result;
    } catch (e) {
      if (throwOnFail) throw e;
      return null;
    }
  };
}

export default pryv;
