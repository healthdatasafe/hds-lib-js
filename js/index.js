'use strict';
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
Object.defineProperty(exports, '__esModule', { value: true });
exports.logger = exports.toolkit = exports.l = exports.localizeText = exports.appTemplates = exports.HDSModel = exports.HDSService = exports.settings = exports.pryv = exports.initHDSModel = exports.getHDSModel = exports.model = void 0;
const localizeText_1 = require('./localizeText');
Object.defineProperty(exports, 'localizeText', { enumerable: true, get: function () { return localizeText_1.localizeText; } });
Object.defineProperty(exports, 'l', { enumerable: true, get: function () { return localizeText_1.localizeText; } });
const settings = __importStar(require('./settings'));
exports.settings = settings;
const patchedPryv_1 = require('./patchedPryv');
Object.defineProperty(exports, 'pryv', { enumerable: true, get: function () { return patchedPryv_1.pryv; } });
const HDSModel_1 = require('./HDSModel/HDSModel');
Object.defineProperty(exports, 'HDSModel', { enumerable: true, get: function () { return HDSModel_1.HDSModel; } });
const appTemplates = __importStar(require('./appTemplates/appTemplates'));
exports.appTemplates = appTemplates;
const logger = __importStar(require('./logger'));
exports.logger = logger;
const HDSService_1 = require('./HDSService');
Object.defineProperty(exports, 'HDSService', { enumerable: true, get: function () { return HDSService_1.HDSService; } });
const HDSModelInitAndSingleton = __importStar(require('./HDSModel/HDSModelInitAndSingleton'));
const toolkit = __importStar(require('./toolkit'));
exports.toolkit = toolkit;
exports.model = (() => {
  console.warn('HDSLib.model is deprecated use getHDSModel() instead');
  return HDSModelInitAndSingleton.getModel();
})();
exports.getHDSModel = HDSModelInitAndSingleton.getModel;
exports.initHDSModel = HDSModelInitAndSingleton.initHDSModel;
// also exporting default for typescript to capture HDSLib.. there is surely a nicer way to do
const HDSLib = {
  getHDSModel: exports.getHDSModel,
  initHDSModel: exports.initHDSModel,
  pryv: patchedPryv_1.pryv,
  settings,
  HDSService: HDSService_1.HDSService,
  HDSModel: HDSModel_1.HDSModel,
  appTemplates,
  localizeText: localizeText_1.localizeText,
  l: localizeText_1.localizeText,
  toolkit,
  logger
};
exports.default = HDSLib;
// # sourceMappingURL=index.js.map
