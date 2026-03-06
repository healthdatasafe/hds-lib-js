"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEventDate = exports.eventToShortText = exports.computeReminders = exports.durationToLabel = exports.durationToSeconds = exports.logger = exports.toolkit = exports.l = exports.localizeText = exports.appTemplates = exports.HDSModel = exports.HDSService = exports.settings = exports.pryv = exports.initHDSModel = exports.getHDSModel = exports.model = void 0;
const localizeText_1 = require("./localizeText");
Object.defineProperty(exports, "localizeText", { enumerable: true, get: function () { return localizeText_1.localizeText; } });
Object.defineProperty(exports, "l", { enumerable: true, get: function () { return localizeText_1.localizeText; } });
const settings = __importStar(require("./settings"));
exports.settings = settings;
const patchedPryv_1 = require("./patchedPryv");
Object.defineProperty(exports, "pryv", { enumerable: true, get: function () { return patchedPryv_1.pryv; } });
const HDSModel_1 = require("./HDSModel/HDSModel");
Object.defineProperty(exports, "HDSModel", { enumerable: true, get: function () { return HDSModel_1.HDSModel; } });
const appTemplates = __importStar(require("./appTemplates/appTemplates"));
exports.appTemplates = appTemplates;
const logger = __importStar(require("./logger"));
exports.logger = logger;
const HDSService_1 = require("./HDSService");
Object.defineProperty(exports, "HDSService", { enumerable: true, get: function () { return HDSService_1.HDSService; } });
const HDSModelInitAndSingleton = __importStar(require("./HDSModel/HDSModelInitAndSingleton"));
const toolkit = __importStar(require("./toolkit"));
exports.toolkit = toolkit;
const duration_1 = require("./utils/duration");
Object.defineProperty(exports, "durationToSeconds", { enumerable: true, get: function () { return duration_1.durationToSeconds; } });
Object.defineProperty(exports, "durationToLabel", { enumerable: true, get: function () { return duration_1.durationToLabel; } });
const reminders_1 = require("./HDSModel/reminders");
Object.defineProperty(exports, "computeReminders", { enumerable: true, get: function () { return reminders_1.computeReminders; } });
const eventToShortText_1 = require("./HDSModel/eventToShortText");
Object.defineProperty(exports, "eventToShortText", { enumerable: true, get: function () { return eventToShortText_1.eventToShortText; } });
Object.defineProperty(exports, "formatEventDate", { enumerable: true, get: function () { return eventToShortText_1.formatEventDate; } });
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
    logger,
    durationToSeconds: duration_1.durationToSeconds,
    durationToLabel: duration_1.durationToLabel,
    computeReminders: reminders_1.computeReminders,
    eventToShortText: eventToShortText_1.eventToShortText,
    formatEventDate: eventToShortText_1.formatEventDate
};
exports.default = HDSLib;
//# sourceMappingURL=index.js.map