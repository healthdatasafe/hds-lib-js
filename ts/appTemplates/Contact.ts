import type { Permission } from './interfaces.ts';
import { getStreamIdAndChildrenIds } from '../toolkit/StreamsTools.ts';
import { pryv, cmc } from '../patchedPryv.ts';
import type { FormSpec } from '../cmc/formSpec.ts';

// ---- Plan 59 Phase 5a — CMC-shaped Contact types ---- //

/**
 * Patient-side "counterparty" access — the data-grant access on the
 * patient's account, owned by the doctor (or bridge service account).
 * Carries the back-channel apiEndpoint + remote stream ids in
 * `clientData.cmc.counterparty.*` once the back-channel handshake
 * completes (see CMC plugin `handleIncomingBackChannel.ts`).
 */
export interface CmcCounterpartyAccess {
  id: string;
  apiEndpoint?: string;
  permissions?: Permission[];
  deleted?: any;
  clientData?: {
    cmc?: {
      role?: string;
      appCode?: string;
      features?: { chat?: boolean; systemMessaging?: boolean; system?: boolean } | null;
      counterparty?: {
        username?: string;
        host?: string;
        apiEndpoint?: string;
        remoteChatStreamId?: string;
        remoteCollectorStreamId?: string;
      };
    };
  };
}

/**
 * Patient-side accept-event record — what `cmc.listAcceptedRelationships`
 * returns. Used to enrich the access-derived relationship with
 * `acceptedAt` + reconcile against ghost records.
 *
 * `hdsFormSpec` is an HDS-extension field, only present when the patient
 * mirrors the FormSpec snapshot onto their own accept event content
 * post-accept (see `cmcFormSpec.mirrorFormSpecOnAcceptEvent`).
 * Consumers fetching accept events directly (raw `events.get`) should
 * pass `content.hdsFormSpec` through to this field; the SDK's
 * `cmc.listAcceptedRelationships` does not return it.
 */
export interface CmcAcceptedRelationship {
  acceptEventId: string;
  counterparty: { username: string; host: string } | null;
  appCode: string | null;
  scopeStreamId: string;
  acceptedAt: number | null;
  features?: { chat?: boolean; systemMessaging?: boolean; system?: boolean };
  backChannelAccessId?: string | null;
  dataGrantAccessId?: string | null;
  hdsFormSpec?: FormSpec | null;
}

/**
 * One CMC relationship between the patient and a counterparty
 * (doctor or bridge). Built from the patient's local counterparty
 * access, optionally enriched with the matching `consent/accept-cmc`
 * event. A single Contact may hold multiple relationships when the
 * same counterparty has multiple data sets / forms.
 */
export interface CmcRelationship {
  /** Patient-side counterparty access id (primary key) */
  accessId: string;
  /** Accept event id under `:_cmc:apps:hds-patient` — null if no matching event found yet */
  acceptEventId: string | null;
  /** Counterparty identity */
  counterparty: { username: string; host: string };
  /** Counterparty apiEndpoint — used to read doctor's chat + form-spec. Null until back-channel handshake completes. */
  counterpartyApiEndpoint: string | null;
  /** Doctor-side chat stream id (patient reads doctor's outgoing chat from here, via counterparty apiEndpoint) */
  remoteChatStreamId: string | null;
  /** Doctor-side collector / form-spec stream id (form-spec template lives under here) */
  remoteCollectorStreamId: string | null;
  /** Patient-side outgoing chat stream id — `<patientScope>:chats:<peerSlug>` */
  localChatStreamId: string;
  /** App code: `hds-collector`, `hds-bridge-<name>`, etc. */
  appCode: string;
  /** Negotiated feature flags */
  features: { chat: boolean; systemMessaging: boolean };
  /** Permissions granted to the counterparty (what the doctor can read from patient) */
  grantedPermissions: Permission[];
  /** Accept timestamp — null if no matching accept event */
  acceptedAt: number | null;
  /** FormSpec snapshot mirrored onto the accept event content. Null until the resolver lands (FormSpec brief step 5). */
  hdsFormSpec: FormSpec | null;
}

/**
 * Plan 66 composite-id base extractor. Refs serialise as either bare cuid
 * (`"abc123"`) for never-updated accesses or composite (`"abc123:3"`) for
 * updated heads / historical writes. Equality must be on the *base* — an
 * event's `modifiedBy` may carry a serial different from the current
 * access head, but it still attributes to the same access chain.
 *
 * Returns the input unchanged when `parseAccessRef` is unavailable
 * (older pryv lib), letting callers keep working under pre-Plan-66 servers.
 */
function refBase (ref: string | null | undefined): string | null {
  if (ref == null) return null;
  const parse = (pryv as any).utils?.parseAccessRef;
  if (typeof parse !== 'function') return ref;
  try {
    return parse(ref).base;
  } catch {
    return null;
  }
}

/**
 * Groups all CMC relationships from the same remote counterparty
 * (doctor, researcher, or bridge service).
 *
 * A Contact represents a person or service that has one or more CMC
 * data-grant accesses on the current user's account. Built via
 * `Contact.aggregateCmc(accesses, accepts, patientScope)` from the
 * patient's local counterparty accesses.
 */
export class Contact {
  /** Remote user's Pryv username. null for bridge/service contacts. */
  remoteUsername: string | null;
  /** Display name (derived from counterparty username, can be overridden) */
  displayName: string;
  /** Raw Pryv counterparty access objects backing the relationships */
  accessObjects: any[];

  /** Cached set of accessible stream IDs (built by initStreamCache) */
  #accessibleStreamIds: Set<string> | null;

  // ---- CMC-shaped fields (Plan 59 Phase 5a; canonical Plan 61 Phase C) ---- //

  /** CMC counterparty identity */
  counterparty: { username: string; host: string } | null;
  /** Person (doctor / researcher) or service (bridge) — derived from app-code prefix */
  kind: 'person' | 'service' | 'unknown';
  /** CMC relationship records — one per active data-grant on the patient side */
  cmcRelationships: CmcRelationship[];

  constructor (remoteUsername: string | null, displayName: string) {
    this.remoteUsername = remoteUsername;
    this.displayName = displayName;
    this.accessObjects = [];
    this.#accessibleStreamIds = null;
    this.counterparty = null;
    this.kind = 'unknown';
    this.cmcRelationships = [];
  }

  /** Associate a raw access object with this contact */
  addAccessObject (access: any): void {
    if (!this.accessObjects.find((a: any) => a.id === access.id)) {
      this.accessObjects.push(access);
    }
  }

  // ---- Stream cache & event filtering ---- //

  /**
   * Build the accessible stream IDs cache from all access permissions.
   * @param streamsById - map of streamId → stream object (with children) from the account
   */
  initStreamCache (streamsById: Record<string, any>): void {
    this.#accessibleStreamIds = new Set();
    for (const access of this.accessObjects) {
      if (access.deleted) continue;
      if (!access.permissions) continue;
      for (const p of access.permissions) {
        if (!p.streamId) continue;
        if (p.streamId === '*') {
          if (!this.isPerson) {
            // Bridge with wildcard: resolve bridge's own streams from access name
            // (access.name is typically the bridge's base stream ID, e.g. "bridge-mira")
            const bridgeStream = access.name ? streamsById[access.name] : null;
            if (bridgeStream) {
              const ids = getStreamIdAndChildrenIds(bridgeStream);
              ids.forEach((id: string) => this.#accessibleStreamIds!.add(id));
            }
            continue; // don't add wildcard for bridges
          }
          this.#accessibleStreamIds.add('*');
          return; // wildcard covers everything for person contacts
        }
        // The granted root is accessible whether or not the stream exists yet —
        // item streams are auto-created on first entry, AFTER this cache is
        // built. Skipping unknown roots made first-ever entries invisible
        // until the next contact rebuild (B-2026-07-02 patient-app flow).
        this.#accessibleStreamIds.add(p.streamId);
        const stream = streamsById[p.streamId];
        if (!stream) continue;
        const ids = getStreamIdAndChildrenIds(stream);
        ids.forEach((id: string) => this.#accessibleStreamIds!.add(id));
      }
    }
    // Plan 59 Phase 5a — also accept chat-stream ids from CMC relationships
    // (both the local outgoing stream on the patient's account and the
    // remote incoming stream on the doctor's account). Without this, doctor-
    // side chat events fetched via back-channel wouldn't pass
    // eventIsAccessible because they're not under any access permission
    // entry on the patient's side. Bare add — both streams have at most
    // one event each per chat message so no children to expand.
    for (const rel of this.cmcRelationships) {
      if (rel.localChatStreamId) this.#accessibleStreamIds.add(rel.localChatStreamId);
      if (rel.remoteChatStreamId) this.#accessibleStreamIds.add(rel.remoteChatStreamId);
    }
  }

  /**
   * Check if an event belongs to this contact's scope.
   * - Person contacts (doctors): event is in a stream covered by their access permissions
   * - Bridge/service contacts: event was created by the bridge OR is in the bridge's streams
   *   (bridges typically have wildcard `*` permissions but should only show their own data)
   */
  eventIsAccessible (event: pryv.Event): boolean {
    if (!this.isPerson) {
      // Bridge/service contacts: check authorship first (fastest)
      if (this.eventIsFromContact(event)) return true;
      // Also check if event is in the bridge's own stream tree
      // (covers data created by older accesses not in previousAccessIds chain)
      if (this.#accessibleStreamIds && !this.#accessibleStreamIds.has('*') && event.streamIds) {
        for (const streamId of event.streamIds) {
          if (this.#accessibleStreamIds.has(streamId)) return true;
        }
      }
      return false;
    }
    // Person contacts: filter by stream permissions
    if (!this.#accessibleStreamIds) return false;
    if (this.#accessibleStreamIds.has('*')) return true;
    if (!event.streamIds) return false;
    for (const streamId of event.streamIds) {
      if (this.#accessibleStreamIds.has(streamId)) return true;
    }
    return false;
  }

  /** Check if an event was created/modified by this contact (including replaced accesses) */
  eventIsFromContact (event: pryv.Event): boolean {
    const eventBase = refBase(event.modifiedBy);
    if (eventBase == null) return false;
    for (const access of this.accessObjects) {
      // Plan 66: access.id may be composite (`<base>:<serial>`) on updated accesses.
      // An event's modifiedBy carries the serial active at write time, possibly
      // different from the current head. Compare on base only.
      if (refBase(access.id) === eventBase) return true;
      // Check previous access IDs from replaced accesses (collector pattern, legacy delete+create).
      // The historical chain stays in clientData even after Plan 58 switches to in-place update.
      const collectorPrevIds = access.clientData?.hdsCollectorClient?.previousAccessIds;
      if (Array.isArray(collectorPrevIds)) {
        for (const prev of collectorPrevIds) {
          if (refBase(prev) === eventBase) return true;
        }
      }
      // Check previous access IDs from bridge access recreate pattern (legacy)
      const bridgePrevIds = access.clientData?.previousAccessIds;
      if (Array.isArray(bridgePrevIds)) {
        for (const prev of bridgePrevIds) {
          if (refBase(prev) === eventBase) return true;
        }
      }
    }
    return false;
  }

  /** Determine chat event source: 'me', 'contact', or 'unknown' */
  chatEventInfos (event: pryv.Event): { source: 'me' | 'contact' | 'unknown' } {
    // Each relationship has ONE local conversation stream holding BOTH
    // directions. The CMC plugin stamps `content.from = {username,...}` on
    // delivered (incoming) events; the local outgoing trigger has no `from`.
    // So within the local chat stream, classify by `content.from`. (Legacy:
    // events still arriving on a counterparty's remoteChatStreamId — pre-mirror
    // back-channel reads — are always the counterparty's.)
    if (!event.streamIds) return { source: 'unknown' };
    for (const rel of this.cmcRelationships) {
      if (!rel.features.chat) continue;
      if (rel.localChatStreamId && event.streamIds.includes(rel.localChatStreamId)) {
        const from = (event.content as { from?: { username?: string } } | null | undefined)?.from;
        return { source: from?.username ? 'contact' : 'me' };
      }
      if (rel.remoteChatStreamId && event.streamIds.includes(rel.remoteChatStreamId)) {
        return { source: 'contact' };
      }
    }
    return { source: 'unknown' };
  }

  // ---- Derived getters (CMC-only) ---- //

  /** Overall status — derived from cmcRelationships. */
  get status (): string | null {
    if (this.cmcRelationships.some(r => r.acceptedAt != null)) return 'Active';
    if (this.cmcRelationships.length > 0) return 'Incoming';
    return null;
  }

  /** Any chat-enabled relationship → true. */
  get hasChat (): boolean {
    return this.cmcRelationships.some(r => r.features.chat);
  }

  /** Distinct CMC app codes attached to this contact. */
  get appStreamIds (): string[] {
    const ids: string[] = [];
    for (const rel of this.cmcRelationships) {
      if (rel.appCode && !ids.includes(rel.appCode)) ids.push(rel.appCode);
    }
    return ids;
  }

  /** Aggregated granted permissions across CMC relationships, deduped. */
  get allPermissions (): Permission[] {
    return this.cmcAllPermissions;
  }

  /** Any relationship has been accepted. */
  get isActive (): boolean {
    return this.cmcRelationships.some(r => r.acceptedAt != null);
  }

  /** Person (has remote username) vs service. */
  get isPerson (): boolean {
    return this.remoteUsername !== null;
  }

  /** Patient-side counterparty access ids backing this contact. */
  get accessIds (): string[] {
    return this.accessObjects.map(a => a?.id).filter((id): id is string => typeof id === 'string');
  }

  // ---- Plan 59 Phase 5a — CMC getters ---- //

  /** Active CMC relationships exist (at least one counterparty access) */
  get cmcIsActive (): boolean {
    return this.cmcRelationships.length > 0;
  }

  /** Any relationship has chat negotiated */
  get cmcHasChat (): boolean {
    return this.cmcRelationships.some(r => r.features.chat);
  }

  /**
   * Chat-stream descriptors, one per chat-enabled relationship.
   *
   * `read` is the doctor-side stream id (read via `counterpartyApiEndpoint`
   * — caller must construct a `pryv.Connection(counterpartyApiEndpoint)`).
   * `write` is the patient-side stream id on the patient's own connection.
   */
  get cmcChatStreams (): Array<{
    read: string | null;
    write: string;
    counterpartyApiEndpoint: string | null;
    accessId: string;
  }> {
    return this.cmcRelationships
      .filter(r => r.features.chat)
      .map(r => ({
        read: r.remoteChatStreamId,
        write: r.localChatStreamId,
        counterpartyApiEndpoint: r.counterpartyApiEndpoint,
        accessId: r.accessId
      }));
  }

  /**
   * Resolved FormSpec snapshots across all active CMC relationships.
   * Skips relationships whose accept event hasn't been mirrored yet
   * (hdsFormSpec === null). One entry per relationship that has a spec.
   */
  get cmcFormSpecs (): FormSpec[] {
    const result: FormSpec[] = [];
    for (const rel of this.cmcRelationships) {
      if (rel.hdsFormSpec) result.push(rel.hdsFormSpec);
    }
    return result;
  }

  /**
   * Aggregated form sections across all active CMC relationships (Tasks
   * page recurring-task loop reads this). Pulled from each relationship's
   * resolved FormSpec; empty if no FormSpecs are mirrored yet.
   */
  get cmcFormSections (): import('./interfaces.ts').CollectorSectionInterface[] {
    const sections: import('./interfaces.ts').CollectorSectionInterface[] = [];
    for (const rel of this.cmcRelationships) {
      const spec = rel.hdsFormSpec;
      if (!spec || !Array.isArray(spec.sections)) continue;
      // FormSpec sections are AppTemplateSection — cast to the legacy
      // CollectorSectionInterface for consumer compatibility (same shape
      // up to a couple of optional fields).
      for (const s of spec.sections) {
        sections.push(s as unknown as import('./interfaces.ts').CollectorSectionInterface);
      }
    }
    return sections;
  }

  /** Aggregated granted permissions across all active CMC relationships (deduped by streamId:level) */
  get cmcAllPermissions (): Permission[] {
    const seen = new Set<string>();
    const result: Permission[] = [];
    for (const rel of this.cmcRelationships) {
      for (const p of rel.grantedPermissions) {
        const key = `${p.streamId}:${p.level}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(p);
        }
      }
    }
    return result;
  }

  // ---- Plan 59 Phase 5a — CMC static helpers ---- //

  /**
   * Person vs service detection from CMC app-code (Q-C1 resolution).
   * `hds-bridge-*` → service; anything else non-null → person; null → unknown.
   */
  static cmcDetectKind (appCode: string | null | undefined): 'person' | 'service' | 'unknown' {
    if (!appCode) return 'unknown';
    if (appCode.startsWith('hds-bridge-')) return 'service';
    return 'person';
  }

  /**
   * Build Contacts from the patient's local counterparty accesses.
   *
   * The counterparty access (`clientData.cmc.role === 'counterparty'`) is
   * the source of truth: it carries the counterparty's apiEndpoint +
   * remote stream ids in `clientData.cmc.counterparty.*`. Accept events
   * (from `cmc.listAcceptedRelationships`) are used only to enrich
   * relationships with `acceptedAt` + `acceptEventId`.
   *
   * Per Q-C2 (CMC plugin Q-C2 resolution 2026-05-21): stale accept events
   * whose backing counterparty access has been revoked are simply dropped —
   * no access → no relationship in the output.
   *
   * @param accesses Patient's accesses from `connection.api('accesses.get')`.
   * @param accepts  Patient's accepted relationships from `cmc.listAcceptedRelationships`.
   * @param patientScopeStreamId The patient's hds-webapp scope (e.g. `:_cmc:apps:hds-patient`).
   *                              Used to build the local chat-stream id.
   */
  static aggregateCmc (
    accesses: CmcCounterpartyAccess[],
    accepts: CmcAcceptedRelationship[],
    patientScopeStreamId: string
  ): Contact[] {
    const byCounterparty = new Map<string, Contact>();

    for (const access of accesses) {
      if (access.deleted) continue;
      const cmcData = access.clientData?.cmc;
      if (cmcData?.role !== 'counterparty') continue;
      const cp = cmcData.counterparty;
      if (!cp?.username || !cp?.host) continue;

      const key = `${cp.username.toLowerCase()}@${cp.host.toLowerCase()}`;
      let contact = byCounterparty.get(key);
      if (!contact) {
        contact = new Contact(cp.username, cp.username);
        contact.counterparty = { username: cp.username, host: cp.host };
        contact.kind = Contact.cmcDetectKind(cmcData.appCode);
        byCounterparty.set(key, contact);
      }

      const appCode = cmcData.appCode || 'unknown';
      // peerSlug for the LOCAL chat stream — slug of the counterparty.
      // Use cmc.counterpartySlug to stay aligned with the SDK / plugin
      // (which canonicalize host casing + strip ports).
      let peerSlug: string;
      try {
        peerSlug = (cmc as any).counterpartySlug({ username: cp.username, host: cp.host });
      } catch {
        // Fallback if the SDK helper is missing in some environment — shouldn't happen
        // in practice, but keeps the aggregator side-effect-free under tests.
        peerSlug = `${cp.username.toLowerCase()}--${cp.host.toLowerCase().replace(/:\d+$/, '').replace(/\./g, '-')}`;
      }
      // Local outgoing chat stream. The CMC plugin provisions the relationship's
      // chat streams under the INVITING app's scope (e.g. the collector's
      // `:_cmc:apps:hds-collector:<collectorId>`) and mirrors that scope onto the
      // accepter's account — NOT under a generic patient app scope. On accept it
      // grants this access `contribute` on the accepter's own per-counterparty
      // chat stream. Prefer that server-granted stream (authoritative: it exists
      // and is writable); else derive from the remote chat stream's scope; else
      // fall back to the legacy patientScopeStreamId. (`clientData.cmc.appCode`
      // is null on counterparty accesses, so the scope can't come from appCode.)
      const grantedChat = (access.permissions ?? []).find(p =>
        typeof p.streamId === 'string' &&
        p.streamId.endsWith(`:chats:${peerSlug}`) &&
        (p.level === 'contribute' || p.level === 'manage'));
      let localChatStreamId: string;
      if (grantedChat) {
        localChatStreamId = grantedChat.streamId;
      } else if (cp.remoteChatStreamId) {
        const remoteScope = cp.remoteChatStreamId.replace(/:chats:[^:]+$/, '');
        localChatStreamId = `${remoteScope}:chats:${peerSlug}`;
      } else {
        localChatStreamId = `${patientScopeStreamId}:chats:${peerSlug}`;
      }

      // Match accept event by (counterparty, appCode). Same counterparty
      // can have multiple accept events for multiple data sets; we just
      // need ANY one of them for acceptedAt enrichment.
      const matchingAccept = accepts.find(a =>
        a.counterparty?.username?.toLowerCase() === cp.username!.toLowerCase() &&
        a.counterparty?.host?.toLowerCase() === cp.host!.toLowerCase() &&
        (a.appCode || 'unknown') === appCode
      );

      const f = cmcData.features ?? null;
      const features = {
        chat: !!f?.chat,
        systemMessaging: !!(f?.systemMessaging ?? f?.system)
      };

      const rel: CmcRelationship = {
        accessId: access.id,
        acceptEventId: matchingAccept?.acceptEventId ?? null,
        counterparty: { username: cp.username, host: cp.host },
        counterpartyApiEndpoint: cp.apiEndpoint ?? null,
        remoteChatStreamId: cp.remoteChatStreamId ?? null,
        remoteCollectorStreamId: cp.remoteCollectorStreamId ?? null,
        localChatStreamId,
        appCode,
        features,
        grantedPermissions: access.permissions ?? [],
        acceptedAt: matchingAccept?.acceptedAt ?? null,
        hdsFormSpec: matchingAccept?.hdsFormSpec ?? null
      };
      contact.cmcRelationships.push(rel);
      contact.addAccessObject(access);
    }

    return Array.from(byCounterparty.values());
  }
}
