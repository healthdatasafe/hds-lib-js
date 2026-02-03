/**
 * Basic logger
 */

interface Logger {
  info: (...args: any[]) => void;
  error: (...args: any[]) => void;
  debug: (...args: any[]) => void;
}

let logger: Logger = {
  info: log('info'),
  error: log('error'),
  debug: log('debug')
};

export function setLogger (newLogger: Logger): void {
  logger = newLogger;
}

export function info (...args: any[]): void { logger.info(...args); }
export function error (...args: any[]): void { logger.error(...args); }
export function debug (..._args: any[]): void {
  // logger.debug(..._args);
}

export function warn (...args: any[]): void {
  logger.info(...args); // Use info for warn for now
}

function log (type: string) {
  return function (...args: any[]) {
    console.log(`Logger: [${type}]`, ...args);
  };
}
