/**
 * App description (data-model APP-DESCRIPTION.md): how an HDS app names the app holding an access.
 *
 * Three sources, one rule: the operator's catalogue (`vouched`), an OAuth client's registration (`registered`), the
 * app's own manifest (`unvouched`), pointed to by `hdsApp.manifest` (`clientData.hdsApp` on a plain access; for a
 * CMC relationship, the invite's `requesterMeta.hdsApp`, which the person's app mirrors as `content.hdsApp` on her
 * accept event, read through `clientData.cmc.acceptEventId`). Pure but for `loadAppManifest` (one fetch per URL per
 * session, never throws), `manifestPointerOfAccess` (reads the accept event) and `mirrorAppPointerOnAcceptEvent`.
 * The words shown around a description ("not listed by Health Data Safe") are the apps'.
 */

export type LocalizedMap = Record<string, string> & { en: string };

export interface AppManifest {
  appCode: string;
  name: LocalizedMap;
  description?: LocalizedMap;
  icon?: string;
  provider?: { name: LocalizedMap; url?: string };
  open: AppOpenLinks;
  privacy?: LocalizedMap;
  support?: string;
}

export interface AppOpenLinks { web?: string; ios?: string; android?: string }

/** A catalogue entry, as `apps/list.json` `partnerApps[]` (and `apps[]` by `id`) */
export interface CatalogueEntryLike {
  id: string;
  appCode?: string;
  manifest?: string;
  counterparty?: { host: string; username?: string };
  name?: string;
  description?: Record<string, string>;
  icon?: { type: string; value: string };
  urls?: AppOpenLinks;
  provider?: string;
}

/** An OAuth client's operator-curated registration */
export interface OAuthClientLike { clientName?: string; logoUri?: string; clientUri?: string }

export type AppTrust = 'vouched' | 'registered' | 'unvouched' | 'none';

export interface AppDescription {
  trust: AppTrust;
  appCode: string;
  /** null with `none`: name it by its id */
  name: LocalizedMap | null;
  description?: LocalizedMap;
  /** never for `unvouched` */
  icon?: { type: string; value: string };
  open: AppOpenLinks;
  provider?: string | LocalizedMap;
  /** the manifest URL's full host, when the manifest supplied what is shown */
  host?: string;
}

export interface DescribeAppInput {
  /** `requestingAppId` (plain access) or `clientData.cmc.appCode` (CMC) */
  appCode: string;
  /** `clientData.cmc.counterparty`, for a CMC relationship */
  counterparty?: { username?: string; host?: string } | null;
  /** a CMC relationship (its `appCode` is the requester's claim); implied by `counterparty` */
  cmc?: boolean;
  /** the normalized `hdsApp.manifest` (`manifestPointerOf`) */
  pointer?: string | null;
  /** the manifest read from `pointer`, when one was needed (`needsManifest`) */
  manifest?: AppManifest | null;
  catalogue?: CatalogueEntryLike[];
  oauthClient?: OAuthClientLike | null;
}

const MAX_URL = 2048;
const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 5000;

function httpsUrl (value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_URL) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function localized (raw: unknown, check: (v: unknown) => string | null = text): LocalizedMap | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [lang, v] of Object.entries(raw as Record<string, unknown>)) {
    const value = check(v);
    if (value) out[lang] = value;
  }
  return out.en ? out as LocalizedMap : null;
}

function openLinks (raw: unknown): AppOpenLinks {
  const out: AppOpenLinks = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const k of ['web', 'ios', 'android'] as const) {
    const url = httpsUrl((raw as Record<string, unknown>)[k]);
    if (url) out[k] = url;
  }
  return out;
}

/** The manifest URL in an `hdsApp` holder (an access's `clientData`, an invite's `requesterMeta`), or null */
export function manifestPointerOf (holder: unknown): string | null {
  const raw = (holder as { hdsApp?: { manifest?: unknown } } | null | undefined)?.hdsApp?.manifest;
  const url = httpsUrl(raw);
  return url && !new URL(url).hash ? url : null;
}

/** An untrusted manifest body as an `AppManifest`, or null; a bad optional field is dropped, never the manifest */
export function parseAppManifest (raw: unknown): AppManifest | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (m.format !== 'hds-app-manifest' || m.formatVersion !== 1) return null;
  const appCode = text(m.appCode);
  const name = localized(m.name);
  if (!appCode || !name) return null;
  const out: AppManifest = { appCode, name, open: openLinks(m.open) };
  const description = localized(m.description);
  if (description) out.description = description;
  const icon = httpsUrl(m.icon);
  if (icon) out.icon = icon;
  const p = m.provider as Record<string, unknown> | undefined;
  const providerName = localized(p?.name);
  if (providerName) {
    out.provider = { name: providerName };
    const url = httpsUrl(p?.url);
    if (url) out.provider.url = url;
  }
  const privacy = localized(m.privacy, httpsUrl);
  if (privacy) out.privacy = privacy;
  const support = httpsUrl(m.support);
  if (support) out.support = support;
  return out;
}

const loads = new Map<string, Promise<AppManifest | null>>();

/**
 * The manifest at `url`, read once per session (a failure is retried on the next call); never throws. No credentials,
 * no referrer, no redirect, a JSON content type, 64 KB, 5 s.
 */
export function loadAppManifest (url: string, fetchImpl: typeof fetch = fetch): Promise<AppManifest | null> {
  let p = loads.get(url);
  if (!p) {
    p = fetchManifest(url, fetchImpl);
    loads.set(url, p);
    p.then(m => { if (m === null && loads.get(url) === p) loads.delete(url); });
  }
  return p;
}

async function fetchManifest (url: string, fetchImpl: typeof fetch): Promise<AppManifest | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer', redirect: 'error', signal: abort.signal });
    if (!res.ok || !/json/i.test(res.headers.get('content-type') ?? '')) return null;
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return null;
    const body = await res.text();
    if (body.length > MAX_BYTES) return null;
    return parseAppManifest(JSON.parse(body));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Forget what was read (tests, sign-out) */
export function clearAppManifests (): void {
  loads.clear();
}

/**
 * The catalogue entry that vouches for this app: by `appCode` / `id`, and for an entry with `counterparty`, by it too.
 * A CMC relationship's app code is the requester's own claim, so only an entry with a matching `counterparty` vouches
 * for one (APP-DESCRIPTION.md § The catalogue vouches).
 */
export function vouchingEntry (input: Pick<DescribeAppInput, 'appCode' | 'counterparty' | 'catalogue' | 'cmc'>): CatalogueEntryLike | null {
  const cmc = input.cmc === true || input.counterparty != null;
  return (input.catalogue ?? []).find(e => {
    if (e.appCode !== input.appCode && e.id !== input.appCode) return false;
    if (!e.counterparty) return !cmc;
    const c = input.counterparty;
    return c?.host === e.counterparty.host && (e.counterparty.username == null || c?.username === e.counterparty.username);
  }) ?? null;
}

/** Whether `describeApp` would use a manifest: no entry supplies the words, and the app points at one */
export function needsManifest (input: Pick<DescribeAppInput, 'appCode' | 'counterparty' | 'cmc' | 'catalogue' | 'pointer' | 'oauthClient'>): boolean {
  if (!input.pointer) return false;
  const entry = vouchingEntry(input);
  if (!entry) return !input.oauthClient?.clientName;
  return sameUrl(entry.manifest, input.pointer) && !(entry.name && entry.description && entry.icon);
}

function sameUrl (a: string | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && httpsUrl(a) === httpsUrl(b);
}

const hostOf = (url: string) => new URL(url).host;

/** The one rule (APP-DESCRIPTION.md § The rule): first match wins */
export function describeApp (input: DescribeAppInput): AppDescription {
  const { appCode, pointer, oauthClient } = input;
  const manifest = input.manifest && input.manifest.appCode === appCode ? input.manifest : null;
  const entry = vouchingEntry(input);
  if (entry) {
    const fill = manifest && pointer && sameUrl(entry.manifest, pointer) ? manifest : null;
    const name = entry.name ? { en: entry.name } : fill?.name ?? null;
    const description = localized(entry.description) ?? fill?.description;
    const icon = entry.icon ?? (fill?.icon ? { type: 'url', value: fill.icon } : undefined);
    const open = Object.keys(openLinks(entry.urls)).length > 0 ? openLinks(entry.urls) : fill?.open ?? {};
    const provider = entry.provider ?? fill?.provider?.name;
    return {
      trust: 'vouched',
      appCode,
      name,
      ...(description && { description }),
      ...(icon && { icon }),
      open,
      ...(provider && { provider }),
      ...(fill && pointer && { host: hostOf(pointer) })
    };
  }
  if (oauthClient?.clientName) {
    const logo = httpsUrl(oauthClient.logoUri);
    const web = httpsUrl(oauthClient.clientUri);
    return {
      trust: 'registered',
      appCode,
      name: { en: oauthClient.clientName },
      ...(logo && { icon: { type: 'url', value: logo } }),
      open: web ? { web } : {}
    };
  }
  if (manifest && pointer) {
    return {
      trust: 'unvouched',
      appCode,
      name: manifest.name,
      ...(manifest.description && { description: manifest.description }),
      open: manifest.open,
      ...(manifest.provider && { provider: manifest.provider.name }),
      host: hostOf(pointer)
    };
  }
  return { trust: 'none', appCode, name: null, open: {} };
}

interface AccessLike { name?: string; clientData?: Record<string, unknown> | null }
interface ConnectionLike { apiOne: (method: string, params: unknown, resultKey?: string) => Promise<unknown> }

/**
 * Who an access says it is: its app code (`cmc.appCode`, else the access name = `requestingAppId`), its CMC
 * counterparty, and whether it is a CMC relationship (`clientData.cmc`)
 */
export function appIdentityOfAccess (access: AccessLike): { appCode: string; counterparty: { username?: string; host?: string } | null; cmc: boolean } {
  const cmc = access.clientData?.cmc as { appCode?: unknown; counterparty?: { username?: string; host?: string } } | undefined;
  const appCode = typeof cmc?.appCode === 'string' && cmc.appCode ? cmc.appCode : access.name ?? '';
  return { appCode, counterparty: cmc?.counterparty ?? null, cmc: cmc != null };
}

/**
 * The manifest URL an access points at: `clientData.hdsApp` on a plain access; for a CMC relationship, `content.hdsApp`
 * on the person's accept event (`clientData.cmc.acceptEventId`; the offer itself is gone behind the consumed
 * capability). Never throws.
 */
export async function manifestPointerOfAccess (connection: ConnectionLike, access: AccessLike): Promise<string | null> {
  const own = manifestPointerOf(access.clientData);
  if (own) return own;
  const acceptEventId = (access.clientData?.cmc as { acceptEventId?: unknown } | undefined)?.acceptEventId;
  if (typeof acceptEventId !== 'string') return null;
  try {
    const accept = await connection.apiOne('events.getOne', { id: acceptEventId }, 'event') as { content?: unknown } | null;
    return manifestPointerOf(accept?.content);
  } catch {
    return null;
  }
}

/**
 * Person-side, at accept: mirror the invite's `requesterMeta.hdsApp` (read before consent, e.g. through
 * `cmcFormSpec.readOfferWithFormSpec(...).content.requesterMeta`) onto her `consent/accept-cmc` event as
 * `content.hdsApp`, as `mirrorFormSpecOnAcceptEvent` does for the data set. Writes nothing (and returns false) when
 * the invite carries no valid pointer. Prefer `mirrorRequesterMetaOnAcceptEvent`, which also keeps a pointerless
 * requester's own name.
 */
export async function mirrorAppPointerOnAcceptEvent (connection: ConnectionLike, acceptEventId: string, requesterMeta: unknown): Promise<boolean> {
  const manifest = manifestPointerOf(requesterMeta);
  if (!manifest) return false;
  const current = await connection.apiOne('events.getOne', { id: acceptEventId }, 'event') as { content?: Record<string, unknown> } | null;
  await connection.apiOne('events.update', { id: acceptEventId, update: { content: { ...(current?.content ?? {}), hdsApp: { manifest } } } }, 'event');
  return true;
}

const MAX_NAME = 100;

/** A self-given name, cleaned: control and format characters (bidi overrides, zero-width) become spaces, whitespace is collapsed; null when empty or over 100 code points */
function personName (raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\p{C}/gu, ' ').replace(/\s+/g, ' ').trim();
  return name && Array.from(name).length <= MAX_NAME ? name : null;
}

/**
 * The requester's own name on her accept event (`content.requesterName`, written by `mirrorRequesterMetaOnAcceptEvent`),
 * cleaned, or null. Self-given: it names the requester behind a relationship in place of the counterparty username
 * (APP-DESCRIPTION.md § The requester behind a relationship), never an app, and never vouches for anything.
 */
export function requesterNameOfAccept (content: unknown): string | null {
  return personName((content as { requesterName?: unknown } | null | undefined)?.requesterName);
}

/**
 * Person-side, at accept: mirror what the invite's `requesterMeta` tells about the requester onto her
 * `consent/accept-cmc` event, in one read and one write. An invite with an `hdsApp` (an app) gets `content.hdsApp` when
 * the pointer is valid, and never a name (no self-asserted app name is kept); an invite without one gets
 * `content.requesterName` from `requesterMeta.displayName`, cleaned (APP-DESCRIPTION.md § The requester behind a
 * relationship). Writes nothing (and returns false) when there is nothing to keep. Supersedes
 * `mirrorAppPointerOnAcceptEvent`.
 */
export async function mirrorRequesterMetaOnAcceptEvent (connection: ConnectionLike, acceptEventId: string, requesterMeta: unknown): Promise<boolean> {
  const meta = requesterMeta as { hdsApp?: unknown; displayName?: unknown } | null | undefined;
  let add: Record<string, unknown>;
  if (meta?.hdsApp != null) {
    const manifest = manifestPointerOf(meta);
    if (!manifest) return false;
    add = { hdsApp: { manifest } };
  } else {
    const requesterName = personName(meta?.displayName);
    if (!requesterName) return false;
    add = { requesterName };
  }
  const current = await connection.apiOne('events.getOne', { id: acceptEventId }, 'event') as { content?: Record<string, unknown> } | null;
  await connection.apiOne('events.update', { id: acceptEventId, update: { content: { ...(current?.content ?? {}), ...add } } }, 'event');
  return true;
}
