import { HDSItemDef } from './HDSItemDef.ts';
import { HDSModel } from './HDSModel.ts';

/**
 * Some call support either arrays of itemKeys or itemDefs
 * test if they are strings or itemDefs and returns an array of itemDefs
 */
export function itemKeysOrDefsToDefs (model: HDSModel, keysOrDefs: Array<string> | Array<HDSItemDef>): HDSItemDef[] {
  const res: HDSItemDef[] = [];
  for (const keyOrDef of keysOrDefs) {
    res.push(itemKeyOrDefToDef(model, keyOrDef));
  }
  return res;
}

/**
 * Some call support either itemKey or itemDef
 * test if string or itemDef and returns an itemDef
 */
export function itemKeyOrDefToDef (model: HDSModel, keyOrDef: string | HDSItemDef): HDSItemDef {
  if (keyOrDef instanceof HDSItemDef) return keyOrDef;
  return model.itemsDefs.forKey(keyOrDef as string);
}
