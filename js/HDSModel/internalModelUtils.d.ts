import { HDSItemDef } from './HDSItemDef';
import { HDSModel } from './HDSModel';
/**
 * Some call support either arrays of itemKeys or itemDefs
 * test if they are strings or itemDefs and returns an array of itemDefs
 */
export declare function itemKeysOrDefsToDefs(model: HDSModel, keysOrDefs: Array<string> | Array<HDSItemDef>): HDSItemDef[];
/**
 * Some call support either itemKey or itemDef
 * test if string or itemDef and returns an itemDef
 */
export declare function itemKeyOrDefToDef(model: HDSModel, keyOrDef: string | HDSItemDef): HDSItemDef;
// # sourceMappingURL=internalModelUtils.d.ts.map
