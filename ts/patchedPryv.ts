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

// pryv 3.2.0 ships pryv.cmc at runtime but no .d.ts entries yet (as of 3.2.0).
// Declare the value-side surface here so consumers can call pryv.cmc.appScope(...)
// without bypassing the patched module via `as any`.
type CmcRuntime = {
  appScope: (appCode: string) => string;
  counterpartySlug: (ref: { username: string; host: string }) => string;
  parseCounterpartySlug: (slug: string) => { username: string; host: string };
  chatStreamUnder: (scopeStreamId: string, peerSlug: string) => string;
  collectorStreamUnder: (scopeStreamId: string, peerSlug: string) => string;
  parseChatStreamId: (streamId: string) => { appCode: string; scopeStreamId: string; counterpartySlug: string; counterparty: { username: string; host: string } };
  parseCollectorStreamId: (streamId: string) => { appCode: string; scopeStreamId: string; counterpartySlug: string; counterparty: { username: string; host: string } };
  extractActor: (apiEndpoint: string, apiUrlTemplate: string) => { username: string; host: string };
  getAppCode: (streamId: string) => string | null;
  isCmcStreamId: (streamId: string) => boolean;
  isAppNestedPluginStream: (streamId: string) => boolean;
  slugifyHost: (host: string) => string;
  NS: string;
  NS_APPS: string;
  NS_INBOX: string;
  NS_INTERNAL: string;
  NS_INTERNAL_RETRIES: string;
  SEPARATOR: string;
  ET_REQUEST: string;
  ET_ACCEPT: string;
  ET_REFUSE: string;
  ET_REVOKE: string;
  ET_CHAT: string;
  ET_SYSTEM_ALERT: string;
  ET_SYSTEM_ACK: string;
  ET_SYSTEM_SCOPE_REQUEST: string;
  ET_SYSTEM_SCOPE_UPDATE: string;
  EVENT_TYPES_LIFECYCLE: readonly string[];
  EVENT_TYPES_CHAT: readonly string[];
  EVENT_TYPES_SYSTEM: readonly string[];
};

// eslint-disable-next-line import-x/export -- declaration merging: value + type namespace
export const pryv = _pryv as unknown as typeof _PryvTypes & { cmc: CmcRuntime };

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

// CMC types are exposed via the value-side cast above (`pryv.cmc.X`); a nested
// `namespace pryv.cmc` would break Node 24's strip-only TS loader (used by mocha).
