import type { serviceCustomizations } from 'pryv';

export = HDSService;
declare class HDSService {
  constructor(serviceInfoUrl?: string, serviceCustomizations?: serviceCustomizations);
}
