import * as settings from './settings.js';
import { pryv } from './patchedPryv.js';

// makes Pryv service aware of default serviceUrl
export class HDSService extends pryv.Service {
  constructor (serviceInfoUrl?: string, serviceCustomizations?: any) {
    serviceInfoUrl = serviceInfoUrl || settings.getServiceInfoURL();
    super(serviceInfoUrl, serviceCustomizations);
  }
}
