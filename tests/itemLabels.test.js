import { assert } from './test-utils/deps-node.js';
import {
  getSectionItemLabels,
  collectItemLabelsFromSections
} from '../ts/appTemplates/itemLabels.ts';

describe('[ILBL] itemLabels', function () {
  describe('getSectionItemLabels', function () {
    it('returns labels for an itemKey present in section', function () {
      const section = {
        key: 's1',
        type: 'permanent',
        name: { en: 'Section 1' },
        itemKeys: ['function-mobility'],
        itemCustomizations: {
          'function-mobility': {
            labels: { question: { en: 'MOBILITY' } }
          }
        }
      };
      const labels = getSectionItemLabels(section, 'function-mobility');
      assert.deepEqual(labels, { question: { en: 'MOBILITY' } });
    });

    it('returns undefined when itemKey not in section', function () {
      const section = { key: 's', type: 'permanent', name: { en: '' }, itemKeys: ['x'] };
      assert.equal(getSectionItemLabels(section, 'function-mobility'), undefined);
    });

    it('returns undefined when no customizations', function () {
      const section = { key: 's', type: 'permanent', name: { en: '' }, itemKeys: ['function-mobility'] };
      assert.equal(getSectionItemLabels(section, 'function-mobility'), undefined);
    });
  });

  describe('collectItemLabelsFromSections', function () {
    const mkSection = (key, itemKeys, customs) => ({
      key, type: 'permanent', name: { en: key }, itemKeys, itemCustomizations: customs
    });

    it('returns empty when no section uses the item', function () {
      const sources = [{
        section: mkSection('s', ['x'], {}),
        source: { contactName: 'A' }
      }];
      assert.deepEqual(collectItemLabelsFromSections('function-mobility', sources), []);
    });

    it('returns one entry per section with non-empty labels and source attribution', function () {
      const sources = [
        {
          section: mkSection('s1', ['function-mobility'], {
            'function-mobility': { labels: { question: { en: 'MOBILITY' } } }
          }),
          source: { contactName: 'Dr. A', formTitle: { en: 'Form A' } }
        },
        {
          section: mkSection('s2', ['function-mobility'], {
            'function-mobility': { labels: { question: { en: 'Walking' } } }
          }),
          source: { contactName: 'Dr. B', formTitle: { en: 'Form B' } }
        }
      ];
      const result = collectItemLabelsFromSections('function-mobility', sources);
      assert.equal(result.length, 2);
      assert.deepEqual(result[0].question, { en: 'MOBILITY' });
      assert.equal(result[0].source.contactName, 'Dr. A');
      assert.deepEqual(result[1].question, { en: 'Walking' });
      assert.equal(result[1].source.contactName, 'Dr. B');
    });

    it('skips sections with no labels when requireLabels=true (default)', function () {
      const sources = [
        {
          section: mkSection('s1', ['function-mobility'], {}),
          source: { contactName: 'A' }
        },
        {
          section: mkSection('s2', ['function-mobility'], {
            'function-mobility': { labels: { question: { en: 'M' } } }
          }),
          source: { contactName: 'B' }
        }
      ];
      const result = collectItemLabelsFromSections('function-mobility', sources);
      assert.equal(result.length, 1);
      assert.equal(result[0].source.contactName, 'B');
    });

    it('includes empty-label sections when requireLabels=false', function () {
      const sources = [
        {
          section: mkSection('s', ['function-mobility'], {}),
          source: { contactName: 'A' }
        }
      ];
      const result = collectItemLabelsFromSections('function-mobility', sources, { requireLabels: false });
      assert.equal(result.length, 1);
      assert.equal(result[0].source.contactName, 'A');
    });

    it('deduplicates identical label sets (default)', function () {
      const sameLabels = { labels: { question: { en: 'MOBILITY' } } };
      const sources = [
        {
          section: mkSection('s1', ['function-mobility'], { 'function-mobility': sameLabels }),
          source: { contactName: 'Dr. A' }
        },
        {
          section: mkSection('s2', ['function-mobility'], { 'function-mobility': sameLabels }),
          source: { contactName: 'Dr. B' }
        }
      ];
      const result = collectItemLabelsFromSections('function-mobility', sources);
      assert.equal(result.length, 1, 'identical labels collapse to one entry');
      assert.equal(result[0].source.contactName, 'Dr. A', 'first occurrence wins');
    });

    it('keeps duplicates when deduplicate=false', function () {
      const same = { labels: { question: { en: 'M' } } };
      const sources = [
        { section: mkSection('s1', ['m'], { m: same }), source: { contactName: 'A' } },
        { section: mkSection('s2', ['m'], { m: same }), source: { contactName: 'B' } }
      ];
      const result = collectItemLabelsFromSections('m', sources, { deduplicate: false });
      assert.equal(result.length, 2);
    });

    it('preserves the options override map', function () {
      const sources = [{
        section: mkSection('s', ['function-mobility'], {
          'function-mobility': {
            labels: {
              question: { en: 'MOBILITY' },
              options: { 0: { en: 'No problems walking' }, 1: { en: 'Unable to walk' } }
            }
          }
        }),
        source: { contactName: 'Dr. A' }
      }];
      const result = collectItemLabelsFromSections('function-mobility', sources);
      assert.equal(result.length, 1);
      assert.deepEqual(result[0].options[0], { en: 'No problems walking' });
      assert.deepEqual(result[0].options[1], { en: 'Unable to walk' });
    });
  });
});
