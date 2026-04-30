import { assert } from './test-utils/deps-node.js';
import { HDSModel } from '../ts/HDSModel/HDSModel.ts';
import fs from 'fs';
import path from 'path';

/**
 * Plan 46 §2.1 — Context-via-substream resolution (D3).
 *
 * Validates the data-model + hds-lib-js implementation end-to-end by loading
 * the locally-built data-model pack.json (so it includes the new treatment-* /
 * procedure-* items registered at parent streams with -fertility context
 * children). Uses loadFromObject to bypass fetch, since Node's fetch does
 * not support file:// URLs.
 */
const localPackPath = path.resolve(
  process.cwd(),
  '../../data-model/data-model/dist/pack.json'
);

describe('[CTXR] Context-via-substream (Plan 46 D3)', () => {
  let model;
  before(() => {
    const packJson = JSON.parse(fs.readFileSync(localPackPath, 'utf8'));
    model = new HDSModel('local-test');
    model.loadFromObject(packJson);
  });

  describe('forEvent — walk-up resolution', () => {
    it('[CTXR-A] direct (streamId, eventType) match still works', () => {
      const itemDef = model.itemsDefs.forEvent({
        type: 'treatment/basic',
        streamIds: ['treatment']
      });
      assert.equal(itemDef.key, 'treatment-basic');
    });

    it('[CTXR-B] descendant streamId resolves via parent walk-up', () => {
      const itemDef = model.itemsDefs.forEvent({
        type: 'treatment/basic',
        streamIds: ['treatment-fertility']
      });
      assert.equal(itemDef.key, 'treatment-basic');
    });

    it('[CTXR-C] coded variant resolves via walk-up from procedure-fertility', () => {
      const itemDef = model.itemsDefs.forEvent({
        type: 'procedure/coded-v1',
        streamIds: ['procedure-fertility']
      });
      assert.equal(itemDef.key, 'procedure-coded');
    });

    it('[CTXR-D] returns null when type+stream cross trees with no match', () => {
      const itemDef = model.itemsDefs.forEvent(
        { type: 'procedure/coded-v1', streamIds: ['treatment-fertility'] },
        false
      );
      assert.equal(itemDef, null);
    });

    it('[CTXR-E] throws by default when nothing resolves', () => {
      assert.throws(
        () => model.itemsDefs.forEvent({ type: 'no-such/type', streamIds: ['treatment'] }),
        /Cannot find definition/
      );
    });
  });

  describe('eventTemplate({ context })', () => {
    it('[CTXR-F] no context falls back to itemDef streamId', () => {
      const itemDef = model.itemsDefs.forKey('treatment-basic');
      const tmpl = itemDef.eventTemplate();
      assert.deepEqual(tmpl.streamIds, ['treatment']);
      assert.equal(tmpl.type, 'treatment/basic');
    });

    it('[CTXR-G] context equal to itemDef streamId emits same value', () => {
      const itemDef = model.itemsDefs.forKey('treatment-basic');
      const tmpl = itemDef.eventTemplate({ context: 'treatment' });
      assert.deepEqual(tmpl.streamIds, ['treatment']);
    });

    it('[CTXR-H] descendant context produces length-1 streamIds with that context', () => {
      const itemDef = model.itemsDefs.forKey('procedure-basic');
      const tmpl = itemDef.eventTemplate({ context: 'procedure-fertility' });
      assert.deepEqual(tmpl.streamIds, ['procedure-fertility']);
      assert.equal(tmpl.type, 'procedure/basic');
    });

    it('[CTXR-I] context outside subtree throws', () => {
      const itemDef = model.itemsDefs.forKey('treatment-basic');
      assert.throws(
        () => itemDef.eventTemplate({ context: 'procedure-fertility' }),
        /not a descendant/
      );
    });

    it('[CTXR-J] unknown context streamId throws', () => {
      const itemDef = model.itemsDefs.forKey('treatment-basic');
      assert.throws(
        () => itemDef.eventTemplate({ context: 'no-such-stream' }),
        /not a descendant/
      );
    });
  });

  describe('legacy multi-streamId resolution still works (no regression)', () => {
    it('[CTXR-K] event with multiple streamIds resolves via direct match', () => {
      // bridge-athenahealth pattern: streamIds carry both the canonical home
      // and a secondary index stream. Resolution should succeed via direct
      // match on either streamId, before walk-up triggers.
      const itemDef = model.itemsDefs.forEvent({
        type: 'treatment/basic',
        streamIds: ['treatment-fertility', 'treatment']
      });
      assert.equal(itemDef.key, 'treatment-basic');
    });
  });

  describe('matchesEvent (D3-aware event matching)', () => {
    it('[CTXR-L] direct (streamId, eventType) match returns true', () => {
      const itemDef = model.itemsDefs.forKey('treatment-basic');
      assert.equal(itemDef.matchesEvent({
        type: 'treatment/basic',
        streamIds: ['treatment']
      }), true);
    });

    it('[CTXR-M] descendant context resolves via walk-up returns true', () => {
      const itemDef = model.itemsDefs.forKey('treatment-coded');
      assert.equal(itemDef.matchesEvent({
        type: 'treatment/coded-v1',
        streamIds: ['treatment-fertility']
      }), true);
    });

    it('[CTXR-N] cross-tree mismatch returns false', () => {
      const itemDef = model.itemsDefs.forKey('treatment-basic');
      assert.equal(itemDef.matchesEvent({
        type: 'procedure/basic',
        streamIds: ['procedure-fertility']
      }), false);
    });

    it('[CTXR-O] missing streamIds or type returns false', () => {
      const itemDef = model.itemsDefs.forKey('treatment-basic');
      assert.equal(itemDef.matchesEvent({}), false);
      assert.equal(itemDef.matchesEvent({ type: 'treatment/basic' }), false);
      assert.equal(itemDef.matchesEvent({ streamIds: ['treatment'] }), false);
    });
  });
});
