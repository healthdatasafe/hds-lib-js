'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.itemKeysOrDefsToDefs = itemKeysOrDefsToDefs;
exports.itemKeyOrDefToDef = itemKeyOrDefToDef;
const HDSItemDef_1 = require('./HDSItemDef');
/**
 * Some call support either arrays of itemKeys or itemDefs
 * test if they are strings or itemDefs and returns an array of itemDefs
 */
function itemKeysOrDefsToDefs (model, keysOrDefs) {
  const res = [];
  for (const keyOrDef of keysOrDefs) {
    res.push(itemKeyOrDefToDef(model, keyOrDef));
  }
  return res;
}
/**
 * Some call support either itemKey or itemDef
 * test if string or itemDef and returns an itemDef
 */
function itemKeyOrDefToDef (model, keyOrDef) {
  if (keyOrDef instanceof HDSItemDef_1.HDSItemDef) { return keyOrDef; }
  return model.itemsDefs.forKey(keyOrDef);
}
// # sourceMappingURL=internalModelUtils.js.map
