import type HDSModel from './HDSModel';
import HDSItemDef = require('./HDSItemDef');
/**
 * Some call support either arrays of itemKeys or itemDefs
 * test if they are strings or itemDefs and returns an array of itemDefs
 * @param {HDSModel} model
 * @param {Array<string>|Array<HDSItemDef>} keysOrDefs
 * @return {Array<HDSItemDef>}
 */
export function itemKeysOrDefsToDefs(model: HDSModel, keysOrDefs: Array<string> | Array<HDSItemDef>): Array<HDSItemDef>;
/**
 * Some call support either itemKey or itemDef
 * test if string or itemDef and returns an itemDef
 * @param {HDSModel} model
 * @param {string|HDSItemDef} keyOrDef
 * @return {HDSItemDef}
 */
export function itemKeyOrDefToDef(model: HDSModel, keyOrDef: string | HDSItemDef): HDSItemDef;
