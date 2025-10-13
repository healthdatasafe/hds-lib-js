import { itemKeysOrDefsToDefs } from './internalModelUtils';
import HDSModel from './HDSModel';
import HDSItemDef from './HDSItemDef';

/**
 * Streams - Extension of HDSModel
 */
export default class HDSModelStreams {
  /**
   * Model instance
   */
  #model: HDSModel;

  /**
   * streamsById
   * Map to find streams by Id
   */
  #modelStreamsById: { [key: string]: any };

  constructor (model: HDSModel) {
    this.#model = model;
    this.#modelStreamsById = {};
    loadModelStreamsById(this.#model.modelData.streams, this.#modelStreamsById);
  }

  /**
   * Get a list of streams to be created for usage of these keys (whithout children)
   */
  getNecessaryListForItems (itemKeysOrDefs: Array<string> | Array<HDSItemDef>, params: {
    nameProperty?: string;
    knowExistingStreamsIds?: Array<string>;
  } = {}): {
    id: string;
    name?: string;
    defaultName?: string;
    parentId?: string;
  }[] {
    const itemDefs = itemKeysOrDefsToDefs(this.#model, itemKeysOrDefs);
    const knowExistingStreamsIds = params.knowExistingStreamsIds || [];
    const nameProperty = params.nameProperty || 'name';

    const result: any[] = [];
    const streams = new Map(); // tempMap to keep streams already in
    for (const knowStreamId of knowExistingStreamsIds) {
      const strs = this.getParentsIds(knowStreamId, false, [knowStreamId]).reverse();
      for (const strId of strs) {
        streams.set(strId, true);
      }
    }
    for (const itemDef of itemDefs) {
      const streamParentIds = this.getParentsIds(itemDef.data.streamId, true, [itemDef.data.streamId]);
      const resultToBeReversed: any[] = [];
      for (let i = streamParentIds.length - 1; i > -1; i--) { // loop reverse to break as soon as we find an existing stream
        const streamId = streamParentIds[i];
        if (streams.has(streamId)) break;
        const stream = this.getDataById(streamId);
        streams.set(streamId, true); // just to flag
        const itemStream: any = { id: streamId, parentId: stream.parentId };
        if (nameProperty !== 'none') {
          itemStream[nameProperty] = stream.name; // to be translated
        }
        resultToBeReversed.push(itemStream);
      }
      // result need to be reversed in order to get parents created before
      result.push(...resultToBeReversed.reverse());
    }
    return result;
  }

  /**
   * Get stream Data by Id;
   */
  getDataById (streamId: string, throwErrorIfNotFound: boolean = true): any {
    const streamData = this.#modelStreamsById[streamId];
    if (throwErrorIfNotFound && !streamData) throw new Error(`Stream with id: "${streamId}" not found`);
    return streamData;
  }

  /**
   * Get all parents id;
   */
  getParentsIds (streamId: string, throwErrorIfNotFound: boolean = true, initialArray: string[] = []): string[] {
    const streamData = this.getDataById(streamId, throwErrorIfNotFound);
    if (!streamData) return initialArray;
    if (streamData.parentId !== null) {
      initialArray.unshift(streamData.parentId);
      this.getParentsIds(streamData.parentId, true, initialArray);
    }
    return initialArray;
  }
}

/**
 * @param streams
 * @param map - key value map
 */
function loadModelStreamsById (streams: any[], map: { [key: string]: any }): void {
  if (!streams) return;
  for (const stream of streams) {
    if (map[stream.id]) {
      // should be tested with a faulty model
      throw new Error(`Duplicate streamId "${stream.id}" for strean ${JSON.stringify(stream)}`);
    }
    map[stream.id] = stream;
    loadModelStreamsById(stream.children, map);
  }
}
