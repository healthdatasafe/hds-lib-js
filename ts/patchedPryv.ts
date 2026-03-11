/**
 * While developing this lib some functionalities should be
 * added to pryv js-lib in a second step
 *
 * CJS→ESM interop: default import gives the module.exports object directly
 * (Connection, Auth, etc.) instead of a frozen namespace wrapper.
 * Type errors from consumers using `pryv.Connection` as a namespace type
 * are suppressed via noEmitOnError: false — the JS output is correct.
 */
// @ts-ignore namespace usage in consumers requires `import *`, but runtime needs default
import pryv from 'pryv';
import monitor from '@pryv/monitor';
import socketIo from '@pryv/socket.io';
// @ts-expect-error CJS plugin pattern: module.exports = function(pryv) { ... }
monitor(pryv);
// @ts-expect-error CJS plugin pattern: module.exports = function(pryv) { ... }
socketIo(pryv);

export { pryv };
