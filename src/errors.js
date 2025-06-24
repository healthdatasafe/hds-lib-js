class HDSLibError extends Error {
  constructor (message, innerObject = { }) {
    const msg = (innerObject.message !== null) ? message + ' >> ' + innerObject.message : message;
    super(msg);
    this.innerObject = innerObject;
  }

  toString () {
    const res = super.toString();
    return res + '\nInner Object:\n' + JSON.stringify(this.innerObject, null, 2);
  }
}

module.exports = {
  HDSLibError
};
