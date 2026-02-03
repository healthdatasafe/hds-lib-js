"use strict";
/**
 * Basic logger
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setLogger = setLogger;
exports.info = info;
exports.error = error;
exports.debug = debug;
exports.warn = warn;
let logger = {
    info: log('info'),
    error: log('error'),
    debug: log('debug')
};
function setLogger(newLogger) {
    logger = newLogger;
}
function info(...args) { logger.info(...args); }
function error(...args) { logger.error(...args); }
function debug(..._args) {
    // logger.debug(..._args);
}
function warn(...args) {
    logger.info(...args); // Use info for warn for now
}
function log(type) {
    return function (...args) {
        console.log(`Logger: [${type}]`, ...args);
    };
}
//# sourceMappingURL=logger.js.map