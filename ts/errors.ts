export class HDSLibError extends Error {
  public innerObject: any;

  constructor (message: string, innerObject: any = {}) {
    const msg = (innerObject.message != null) ? message + ' >> ' + innerObject.message : message;
    super(msg);
    this.innerObject = innerObject;
  }

  toString (): string {
    const res = super.toString();
    return res + '\nInner Object:\n' + JSON.stringify(this.innerObject, null, 2);
  }
}
