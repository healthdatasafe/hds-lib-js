import * as settings from './settings';
import pryv from './patchedPryv';

// makes Pryv service aware of default serviceUrl
export default class HDSService extends pryv.Service {
  constructor (serviceInfoUrl?: string, serviceCustomizations?: any) {
    serviceInfoUrl = serviceInfoUrl || settings.getServiceInfoURL();
    super(serviceInfoUrl, serviceCustomizations);
  }
}
