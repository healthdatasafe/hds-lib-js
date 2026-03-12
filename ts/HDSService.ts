import * as settings from './settings.ts';
import { pryv } from './patchedPryv.ts';

// makes Pryv service aware of default serviceUrl
export class HDSService extends pryv.Service {
  constructor (serviceInfoUrl?: string, serviceCustomizations?: any) {
    serviceInfoUrl = serviceInfoUrl || settings.getServiceInfoURL();
    super(serviceInfoUrl, serviceCustomizations);
  }
}
