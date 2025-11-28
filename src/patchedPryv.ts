/**
 * While developing this lib some functionalities should be
 * added to pryv js-lib in a second step
 */

import * as pryv from 'pryv';
import monitor from '@pryv/monitor';
import socketIo from '@pryv/socket.io';
monitor(pryv);
socketIo(pryv);

export default pryv;
