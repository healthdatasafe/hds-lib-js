import HDSItemDef from './HDSItemDef';
import HDSModel from './HDSModel';

/**
 * ItemsDefs - Extension of HDSModel
 */
export default class HDSModelItemsDefs {
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
   * get all itemDefs
   */
  getAll (): HDSItemDef[] {
    const res: HDSItemDef[] = [];
    for (const key of Object.keys(this.#model.modelData.items)) {
      res.push(this.forKey(key));
    }
    return res;
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
    this.#itemsDefs[key] = new HDSItemDef(key, defData);
    return this.#itemsDefs[key];
  }

  /**
   * get a definition for an event
   */
  forEvent (event: any, throwErrorIfNotFound: boolean = true): HDSItemDef | null {
    const candidates: any[] = [];
    for (const streamId of event.streamIds) {
      const keyStreamIdEventType = streamId + ':' + event.type;
      const candidate = this.#modelDataByStreamIdEventTypes[keyStreamIdEventType];
      if (candidate) candidates.push(candidate);
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
