const HDSItemDef = require('./HDSItemDef');

module.exports = {
  itemKeysOrDefsToDefs,
  itemKeyOrDefToDef
};

/**
 * Some call support either arrays of itemKeys or itemDefs
 * test if they are strings or itemDefs and returns an array of itemDefs
 * @param {HDSModel} model
 * @param {Array<string>|Array<HDSItemDef>} keysOrDefs
 * @return {Array<HDSItemDef>}
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
 * @param {HDSModel} model
 * @param {string|HDSItemDef} keyOrDef
 * @return {HDSItemDef}
 */
function itemKeyOrDefToDef (model, keyOrDef) {
  if (keyOrDef instanceof HDSItemDef) return keyOrDef;
  return model.itemsDefs.forKey(keyOrDef);
}
