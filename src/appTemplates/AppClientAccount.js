const Application = require('./Application');
/**
 * - applications
 *   - [baseStreamId] "Root" stream from this app
 */
class AppClientAccount extends Application {
  get appSettings () {
    return {
      canBePersonnal: true,
      mustBeMaster: true
    };
  }

  /**
   * - Check connection validity
   * - Make sure stream structure exists
   */
  async init () {
    return super.init();
  }
}

module.exports = AppClientAccount;
