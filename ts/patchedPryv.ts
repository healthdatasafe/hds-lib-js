/**
 * CJS→ESM interop for the pryv package with plugin patching.
 *
 * Default import gives the module.exports object directly (Connection, Auth, etc.).
 * We re-export both the runtime value AND a merged type namespace so that consumers
 * can use `pryv.Connection` as both a constructor and a type annotation.
 */
import _pryv from 'pryv';
import type * as _PryvTypes from 'pryv';
import monitor from '@pryv/monitor';
import socketIo from '@pryv/socket.io';
// @ts-expect-error CJS plugin pattern: module.exports = function(pryv) { ... }
monitor(_pryv);
// @ts-expect-error CJS plugin pattern: module.exports = function(pryv) { ... }
socketIo(_pryv);

// Declaration merging: the exported `pryv` const provides the runtime value,
// and the namespace augments it with all the types from pryv's .d.ts.
// This lets consumers write both `new pryv.Connection(...)` and `x: pryv.Connection`.

// eslint-disable-next-line import-x/export -- declaration merging: value + type namespace
export const pryv = _pryv as unknown as typeof _PryvTypes;

// eslint-disable-next-line @typescript-eslint/no-namespace, import-x/export -- declaration merging
export namespace pryv {
  export type Connection = _PryvTypes.Connection;
  export type Service = _PryvTypes.Service;
  export type Stream = _PryvTypes.Stream;
  export type Event = _PryvTypes.Event;
  export type APICall = _PryvTypes.APICall;
  export type AccessInfo = _PryvTypes.AccessInfo;
  export type Access = _PryvTypes.Access;
  export type Permission = _PryvTypes.Permission;
  export type ServiceInfo = _PryvTypes.ServiceInfo;
  export type ServiceAssets = _PryvTypes.ServiceAssets;
  export type AuthController = _PryvTypes.AuthController;
  export type AuthSettings = _PryvTypes.AuthSettings;
  export type ItemDeletion = _PryvTypes.ItemDeletion;
  export type PryvError = _PryvTypes.PryvError;
  export type KeyValue = _PryvTypes.KeyValue;
}
