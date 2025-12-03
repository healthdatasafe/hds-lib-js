import { HDSItemDef } from './HDSItemDef';
import { HDSModel } from './HDSModel';
/**
 * ItemsDefs - Extension of HDSModel
 */
export declare class HDSModelItemsDefs {
  #private;
  constructor(model: HDSModel);
  /**
     * get all itemDefs
     */
  getAll(): HDSItemDef[];
  /**
     * get item for a key
     */
  forKey(key: string, throwErrorIfNotFound?: boolean): HDSItemDef | null;
  /**
     * get a definition for an event
     */
  forEvent(event: any, throwErrorIfNotFound?: boolean): HDSItemDef | null;
}
// # sourceMappingURL=HDSModel-ItemsDefs.d.ts.map
