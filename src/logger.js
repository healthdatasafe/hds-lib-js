/**
 * Basic logger
 */
module.exports = {
  setLogger,
  info,
  error,
  debug
};

let logger = {
  info: log('info'),
  error: log('error'),
  debug: log('debug')
};

function setLogger (newLogger) {
  logger = newLogger;
}

function info () { logger.info(...arguments); }
function error () { logger.error(...arguments); }
function debug () {
  // logger.debug(...arguments);
}

function log (type) {
  return function () {
    console.log(`Logger: [${type}]`, ...arguments);
  };
}
