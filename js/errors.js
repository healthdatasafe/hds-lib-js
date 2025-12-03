'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.HDSLibError = void 0;
class HDSLibError extends Error {
  innerObject;
  constructor (message, innerObject = {}) {
    const msg = (innerObject.message != null) ? message + ' >> ' + innerObject.message : message;
    super(msg);
    this.innerObject = innerObject;
  }

  toString () {
    const res = super.toString();
    return res + '\nInner Object:\n' + JSON.stringify(this.innerObject, null, 2);
  }
}
exports.HDSLibError = HDSLibError;
// # sourceMappingURL=errors.js.map
