const { assert } = require('./test-utils/deps-node');

const { allStreamsAndChildren, getStreamIdAndChildrenIds } = require('../js/toolkit/StreamsTools');

describe('[TKTX] toolKit Streams Tools', function () {
  describe('[TKAX] allStreamsAndChildren', function () {
    it('[TKAA] should iterate over flat streams', () => {
      const streams = [
        { id: 'stream1', name: 'Stream 1' },
        { id: 'stream2', name: 'Stream 2' }
      ];
      const result = [...allStreamsAndChildren(streams)];
      assert.equal(result.length, 2);
      assert.equal(result[0].id, 'stream1');
      assert.equal(result[1].id, 'stream2');
    });

    it('[TKAB] should iterate over nested streams', () => {
      const streams = [
        {
          id: 'parent',
          name: 'Parent',
          children: [
            { id: 'child1', name: 'Child 1' },
            { id: 'child2', name: 'Child 2', children: [{ id: 'grandchild', name: 'Grandchild' }] }
          ]
        }
      ];
      const result = [...allStreamsAndChildren(streams)];
      assert.equal(result.length, 4);
      assert.equal(result[0].id, 'parent');
      assert.equal(result[1].id, 'child1');
      assert.equal(result[2].id, 'child2');
      assert.equal(result[3].id, 'grandchild');
    });

    it('[TKAC] should handle empty children array', () => {
      const streams = [
        { id: 'stream1', name: 'Stream 1', children: [] }
      ];
      const result = [...allStreamsAndChildren(streams)];
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'stream1');
    });

    it('[TKAD] should handle empty input', () => {
      const result = [...allStreamsAndChildren([])];
      assert.equal(result.length, 0);
    });
  });

  describe('[TKGX] getStreamIdAndChildrenIds', function () {
    it('[TKGA] should return stream id and all children ids', () => {
      const stream = {
        id: 'parent',
        name: 'Parent',
        children: [
          { id: 'child1', name: 'Child 1' },
          { id: 'child2', name: 'Child 2' }
        ]
      };
      const result = getStreamIdAndChildrenIds(stream);
      assert.deepEqual(result, ['parent', 'child1', 'child2']);
    });

    it('[TKGB] should return only stream id for stream without children', () => {
      const stream = { id: 'solo', name: 'Solo' };
      const result = getStreamIdAndChildrenIds(stream);
      assert.deepEqual(result, ['solo']);
    });

    it('[TKGC] should handle deeply nested children', () => {
      const stream = {
        id: 'root',
        name: 'Root',
        children: [
          {
            id: 'level1',
            name: 'Level 1',
            children: [
              {
                id: 'level2',
                name: 'Level 2',
                children: [{ id: 'level3', name: 'Level 3' }]
              }
            ]
          }
        ]
      };
      const result = getStreamIdAndChildrenIds(stream);
      assert.deepEqual(result, ['root', 'level1', 'level2', 'level3']);
    });
  });
});
