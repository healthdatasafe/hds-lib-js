import { HDSModel } from './HDSModel';
import { HDSItemDef } from './HDSItemDef';
/**
 * Streams - Extension of HDSModel
 */
export declare class HDSModelStreams {
  #private;
  constructor(model: HDSModel);
  /**
     * Get a list of streams to be created for usage of these keys (whithout children)
     */
  getNecessaryListForItems(itemKeysOrDefs: Array<string> | Array<HDSItemDef>, params?: {
        nameProperty?: string;
        knowExistingStreamsIds?: Array<string>;
    }): {
        id: string;
        name?: string;
        defaultName?: string;
        parentId?: string;
    }[];

  /**
     * Get stream Data by Id;
     */
  getDataById(streamId: string, throwErrorIfNotFound?: boolean): any;
  /**
     * Get all parents id;
     */
  getParentsIds(streamId: string, throwErrorIfNotFound?: boolean, initialArray?: string[]): string[];
}
// # sourceMappingURL=HDSModel-Streams.d.ts.map
