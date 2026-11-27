import { itemKeysOrDefsToDefs } from './internalModelUtils.ts';
import { HDSModel } from './HDSModel.ts';
import { HDSItemDef } from './HDSItemDef.ts';

/**
 * Streams - Extension of HDSModel
 */
export class HDSModelStreams {
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
   * True iff the stream exists and its data-model definition carries
   * `role: 'context'` — i.e. it's a descendant-streamId marker for the D3
   * context-via-substream mechanic, not a data-bearing bucket. Unknown
   * streamIds return `false` (no throw — this is a yes/no probe).
   *
   * Consumers (settings trees, form-section renderers, dashboards) should
   * use this to elide / mute / re-render context streams as metadata rather
   * than as independent input streams. See Plan 53.
   */
  isContext (streamId: string): boolean {
    const streamData = this.#modelStreamsById[streamId];
    return streamData != null && streamData.role === 'context';
  }

  /**
   * Ids of the roots marked `explicitGrantOnly` (data-model 3.43.0: `genetics`). An access covers such a root only
   * when it names it or one of its children, never through `*` or a grant on another root: a `*` consent request is
   * expanded into the model roots minus these, a directly minted `*` access carries a `level: 'none'` mask on each.
   * See data-model documentation/GENETICS.md.
   */
  explicitGrantOnlyRootIds (): string[] {
    return Object.values(this.#modelStreamsById)
      .filter((s: any) => s.parentId == null && s.explicitGrantOnly === true)
      .map((s: any) => s.id);
  }

  /**
   * Whether `streamId` is a marked root or under one (see `explicitGrantOnlyRootIds`). False for a stream the model
   * does not know.
   */
  isExplicitGrantOnly (streamId: string): boolean {
    const marked = this.explicitGrantOnlyRootIds();
    if (marked.length === 0 || this.#modelStreamsById[streamId] == null) return false;
    return [streamId, ...this.getParentsIds(streamId, false)].some((id) => marked.includes(id));
  }

  /**
   * The item streams under `streamId`, parents first, when `streamId` is itself an item's stream; else `[]`.
   * These are the streams `authorizations.forItemKeys` folds into `streamId` (a child item's permission is dropped when
   * its parent is requested at the same or a higher level), so a consent that creates only the granted streams would
   * leave them missing, and a reader naming one gets `unknown-referenced-resource` (B-2026-11-24-12). A stream that no
   * item writes to (a grouping such as `body-blood`) returns `[]`: its subtree is not the request's to create.
   */
  itemStreamsUnder (streamId: string): string[] {
    const itemStreams = new Set(this.#model.itemsDefs.getAll().map((d) => d.data.streamId));
    if (!itemStreams.has(streamId)) return [];
    const out: string[] = [];
    const walk = (node: any): void => {
      for (const child of node?.children ?? []) {
        if (itemStreams.has(child.id)) out.push(child.id);
        walk(child);
      }
    };
    walk(this.#modelStreamsById[streamId]);
    return out;
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
