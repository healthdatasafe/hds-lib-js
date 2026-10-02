import { assert } from './test-utils/deps-node.js';
import { HDSModel } from '../ts/HDSModel/HDSModel.ts';

/**
 * System items (`type: system`, data-model 3.13.0): state written by software,
 * e.g. a connector's status under `sync-status`. Readable and resolvable like any
 * item, never offered in pickers.
 */

/** Minimal pack.json-shaped model: one regular item + the `sync-status` system item with two context leaves. */
function makeModel () {
  return {
    items: {
      'body-weight': {
        version: 'v1',
        label: { en: 'Body weight' },
        description: { en: 'Your weight.' },
        streamId: 'body-weight',
        eventType: 'mass/kg',
        type: 'number',
        repeatable: 'any'
      },
      'sync-status': {
        version: 'v1',
        label: { en: 'Connected services status' },
        description: { en: 'Whether your connected services are working and when they last synced.' },
        streamId: 'sync-status',
        eventType: 'sync-status/connector-v1',
        type: 'system',
        repeatable: 'once'
      }
    },
    streams: [
      { id: 'body-weight', name: 'Body weight', parentId: null },
      {
        id: 'sync-status',
        name: 'Connected services',
        parentId: null,
        children: [
          { id: 'sync-status-mira', name: 'Mira connection status', parentId: 'sync-status', role: 'context' },
          { id: 'sync-status-tempdrop', name: 'Tempdrop connection status', parentId: 'sync-status', role: 'context' }
        ]
      }
    ]
  };
}

function load (data) {
  const model = new HDSModel('http://fake/pack.json');
  model.loadFromObject(data);
  return model;
}

describe('[SYSX] system items', () => {
  it('[SYS1] isSystem is true for type: system and false otherwise', () => {
    const model = load(makeModel());
    assert.equal(model.itemsDefs.forKey('sync-status').isSystem, true);
    assert.equal(model.itemsDefs.forKey('body-weight').isSystem, false);
  });

  it('[SYS2] getAllActive hides system items, getAll keeps them', () => {
    const model = load(makeModel());
    assert.deepEqual(model.itemsDefs.getAllActive().map((i) => i.key), ['body-weight']);
    assert.equal(model.itemsDefs.getAll().length, 2);
  });

  it('[SYS3] an event on a connector leaf resolves to the system item', () => {
    const model = load(makeModel());
    const itemDef = model.itemsDefs.forEvent({
      streamIds: ['sync-status-mira'],
      type: 'sync-status/connector-v1'
    });
    assert.equal(itemDef.key, 'sync-status');
  });

  it('[SYS4] eventTemplate places a connector status on its leaf', () => {
    const model = load(makeModel());
    const template = model.itemsDefs.forKey('sync-status').eventTemplate({ context: 'sync-status-mira' });
    assert.deepEqual(template, { streamIds: ['sync-status-mira'], type: 'sync-status/connector-v1' });
  });

  it('[SYS5] eventTemplate refuses a context outside the sync-status tree', () => {
    const model = load(makeModel());
    assert.throws(() => model.itemsDefs.forKey('sync-status').eventTemplate({ context: 'body-weight' }));
  });
});
