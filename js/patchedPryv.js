'use strict';
/**
 * While developing this lib some functionalities should be
 * added to pryv js-lib in a second step
 */
const __createBinding = (this && this.__createBinding) || (Object.create
  ? function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    let desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function () { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
  }
  : function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
  });
const __setModuleDefault = (this && this.__setModuleDefault) || (Object.create
  ? function (o, v) {
    Object.defineProperty(o, 'default', { enumerable: true, value: v });
  }
  : function (o, v) {
    o.default = v;
  });
const __importStar = (this && this.__importStar) || (function () {
  let ownKeys = function (o) {
    ownKeys = Object.getOwnPropertyNames || function (o) {
      const ar = [];
      for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
      return ar;
    };
    return ownKeys(o);
  };
  return function (mod) {
    if (mod && mod.__esModule) return mod;
    const result = {};
    if (mod != null) for (let k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== 'default') __createBinding(result, mod, k[i]);
    __setModuleDefault(result, mod);
    return result;
  };
})();
const __importDefault = (this && this.__importDefault) || function (mod) {
  return (mod && mod.__esModule) ? mod : { default: mod };
};
Object.defineProperty(exports, '__esModule', { value: true });
exports.pryv = void 0;
const pryv = __importStar(require('pryv'));
exports.pryv = pryv;
const monitor_1 = __importDefault(require('@pryv/monitor'));
const socket_io_1 = __importDefault(require('@pryv/socket.io'));
(0, monitor_1.default)(pryv);
(0, socket_io_1.default)(pryv);
// # sourceMappingURL=patchedPryv.js.map
