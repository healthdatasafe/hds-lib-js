const settings = require('./settings');
const pryv = require('./patchedPryv');

// makes Pryv service aware of default serviceUrl
class HDSService extends pryv.Service {
  constructor (serviceInfoUrl, serviceCustomizations) {
    serviceInfoUrl = serviceInfoUrl || settings.getServiceInfoURL();
    super(serviceInfoUrl, serviceCustomizations);
  }
}

module.exports = HDSService;
