import { HDSItemDef } from './HDSItemDef.ts';
import { HDSModel } from './HDSModel.ts';

/**
 * ItemsDefs - Extension of HDSModel
 */
export class HDSModelItemsDefs {
  /**
   * Model instance
   */
  #model: HDSModel;

  /**
   * ItemDefs Cache
   * KeyValue of itemsDefs
   */
  #itemsDefs: { [key: string]: HDSItemDef };

  /**
   * get itemsData by streamId and eventType
   */
  #modelDataByStreamIdEventTypes: { [key: string]: any };

  constructor (model: HDSModel) {
    this.#model = model;
    this.#itemsDefs = {};
    this.#modelDataByStreamIdEventTypes = {};
    loadModelDataByStreamIdEventTypes(this.#model.modelData.items, this.#modelDataByStreamIdEventTypes);
  }

  /**
   * get all itemDefs (includes deprecated). Use this when reading existing
   * events: every event must still resolve to an itemDef even if the item
   * was deprecated.
   */
  getAll (): HDSItemDef[] {
    const res: HDSItemDef[] = [];
    for (const key of Object.keys(this.#model.modelData.items)) {
      res.push(this.forKey(key));
    }
    return res;
  }

  /**
   * get all non-deprecated itemDefs. Use this for any UI that lets a user
   * pick an item to create new data points (form builders, item picker
   * sheets, data-model browser default listing). Deprecated items remain
   * resolvable via `forKey` / `forEvent` so existing events still render.
   */
  getAllActive (): HDSItemDef[] {
    return this.getAll().filter((itemDef) => !itemDef.isDeprecated);
  }

  /**
   * get item for a key
   */
  forKey (key: string, throwErrorIfNotFound: boolean = true): HDSItemDef | null {
    if (this.#itemsDefs[key]) return this.#itemsDefs[key];
    const defData = this.#model.modelData.items[key];
    if (!defData) {
      if (throwErrorIfNotFound) throw new Error('Cannot find item definition with key: ' + key);
      return null;
    }
    this.#itemsDefs[key] = new HDSItemDef(key, defData, this.#model);
    return this.#itemsDefs[key];
  }

  /**
   * get a definition for an event
   *
   * Resolution rule (Plan 46 §2.1 — context-via-substream / D3):
   *   1. Try direct match on every entry in event.streamIds (legacy: events
   *      may carry multiple streamIds, e.g. bridge-athenahealth credentials).
   *   2. If no direct match, walk parents of streamIds[0] looking for a
   *      matching itemDef. Closest ancestor wins.
   *
   * The walk-up reuses `HDSModelStreams.getParentsIds`, the same helper
   * Authorizations consumes (HDSModel-Authorizations.ts:86) and the same
   * algorithm Plan 45's resolveStream.ts uses for clientData lookup.
   */
  forEvent (event: any, throwErrorIfNotFound: boolean = true): HDSItemDef | null {
    const candidates: any[] = [];
    for (const streamId of event.streamIds) {
      const keyStreamIdEventType = streamId + ':' + event.type;
      const candidate = this.#modelDataByStreamIdEventTypes[keyStreamIdEventType];
      if (candidate) candidates.push(candidate);
    }
    if (candidates.length === 0 && event.streamIds && event.streamIds.length > 0) {
      const primary = event.streamIds[0];
      // getParentsIds returns root-first ancestors of `primary` (excludes self).
      // We need closest-ancestor-wins, so iterate leaf-to-root: walk parents
      // in reverse, then check `primary` is already covered by the direct-match
      // pass above — so we only need ancestors here.
      const ancestorsRootFirst = this.#model.streams.getParentsIds(primary, false);
      for (let i = ancestorsRootFirst.length - 1; i >= 0; i--) {
        const ancestorId = ancestorsRootFirst[i];
        const keyStreamIdEventType = ancestorId + ':' + event.type;
        const candidate = this.#modelDataByStreamIdEventTypes[keyStreamIdEventType];
        if (candidate) {
          candidates.push(candidate);
          break;
        }
      }
    }
    if (candidates.length === 0) {
      if (throwErrorIfNotFound) throw new Error('Cannot find definition for event: ' + JSON.stringify(event));
      return null;
    }
    if (candidates.length > 1) {
      throw new Error(`Found multiple matching definitions "${candidates.map(c => (c.key)).join(', ')}" for event: ${JSON.stringify(event)}`);
    }
    return this.forKey(candidates[0].key, throwErrorIfNotFound);
  }
}

/**
 * Add key to model items and
 * load modeldata item into modelDataByStreamIdEventTypes for fast search
 */
function loadModelDataByStreamIdEventTypes (model: any, map: { [key: string]: any }): void {
  for (const item of Object.values(model)) {
    const eventTypes: string[] = [];
    if ((item as any).eventType) {
      eventTypes.push((item as any).eventType);
    } else {
      const types = (item as any).variations.eventType.options.map((o: any) => o.value);
      eventTypes.push(...types);
    }

    for (const eventType of eventTypes) {
      const keyStreamIdEventType = (item as any).streamId + ':' + eventType;
      if (map[keyStreamIdEventType]) {
        // should be tested with a faulty model
        throw new Error(`Duplicate streamId + eventType "${keyStreamIdEventType}" for item ${JSON.stringify(item)}`);
      }
      map[keyStreamIdEventType] = item;
    }
  }
}
