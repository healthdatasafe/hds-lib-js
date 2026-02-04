const { assert } = require('./test-utils/deps-node');

const logger = require('../js/logger');

describe('[LOGX] Logger', function () {
  describe('[LGFX] Logger functions', function () {
    it('[LGFA] info() should call logger.info', () => {
      let called = false;
      let loggedArgs = null;
      const customLogger = {
        info: (...args) => { called = true; loggedArgs = args; },
        error: () => {},
        debug: () => {}
      };
      logger.setLogger(customLogger);
      logger.info('test message', { data: 123 });
      assert.equal(called, true);
      assert.deepEqual(loggedArgs, ['test message', { data: 123 }]);
    });

    it('[LGFB] error() should call logger.error', () => {
      let called = false;
      let loggedArgs = null;
      const customLogger = {
        info: () => {},
        error: (...args) => { called = true; loggedArgs = args; },
        debug: () => {}
      };
      logger.setLogger(customLogger);
      logger.error('error message', new Error('test'));
      assert.equal(called, true);
      assert.equal(loggedArgs[0], 'error message');
    });

    it('[LGFC] warn() should call logger.info (warn uses info internally)', () => {
      let called = false;
      let loggedArgs = null;
      const customLogger = {
        info: (...args) => { called = true; loggedArgs = args; },
        error: () => {},
        debug: () => {}
      };
      logger.setLogger(customLogger);
      logger.warn('warning message');
      assert.equal(called, true);
      assert.deepEqual(loggedArgs, ['warning message']);
    });

    it('[LGFD] setLogger() should replace the logger', () => {
      const logs = [];
      const customLogger = {
        info: (...args) => logs.push(['info', ...args]),
        error: (...args) => logs.push(['error', ...args]),
        debug: (...args) => logs.push(['debug', ...args])
      };
      logger.setLogger(customLogger);
      logger.info('msg1');
      logger.error('msg2');
      logger.warn('msg3');
      assert.equal(logs.length, 3);
      assert.deepEqual(logs[0], ['info', 'msg1']);
      assert.deepEqual(logs[1], ['error', 'msg2']);
      assert.deepEqual(logs[2], ['info', 'msg3']); // warn uses info
    });
  });
});
