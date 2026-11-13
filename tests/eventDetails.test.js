import { assert } from './test-utils/deps-node.js';
import { compositeParts, formatDuration } from '../ts/index.ts';
import { getModel, resetModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';
import { setPreferredLocales, resetPreferredLocales } from '../ts/localizeText.ts';

/**
 * What an entry's details show beside its short text (B-2026-11-13-5): a composite's parts, labelled, and the
 * event's duration in words.
 */

const modelURL = 'https://model.datasafe.dev/pack.json';

function makeModel () {
  return {
    items: {
      'encounter-visit': {
        version: 'v1',
        label: { en: 'Care visit' },
        description: { en: 'A visit.' },
        streamId: 'encounter-visit',
        eventType: 'encounter/visit-v1',
        type: 'composite',
        composite: {
          kind: {
            type: 'select',
            label: { en: 'Type of visit', fr: 'Type de visite' },
            options: [
              { value: 'consultation', label: { en: 'Consultation', fr: 'Consultation' } },
              { value: 'teleconsultation', label: { en: 'Teleconsultation', fr: 'Téléconsultation' } }
            ]
          },
          reason: { type: 'text', label: { en: 'Reason', fr: 'Motif' }, canBeNull: true },
          notes: { type: 'text', label: { en: 'Notes', fr: 'Notes' }, canBeNull: true }
        }
      },
      'fertility-delivery': {
        version: 'v1',
        label: { en: 'Delivery' },
        description: { en: 'A birth.' },
        streamId: 'fertility-deliveries',
        eventType: 'delivery/composite-v1',
        type: 'composite',
        composite: {
          birthWeight: { type: 'number', label: { en: 'Birth weight (g)', fr: 'Poids de naissance (g)' }, canBeNull: true },
          score: {
            type: 'select',
            label: { en: 'Score' },
            options: [{ value: 0, label: { en: 'Low' } }, { value: 1, label: { en: 'High' } }]
          }
        }
      },
      'note-txt': {
        version: 'v1',
        label: { en: 'Note' },
        description: { en: 'A note.' },
        streamId: 'notes',
        eventType: 'note/txt',
        type: 'text'
      }
    },
    streams: [
      { id: 'encounter-visit', name: 'Visits and stays', parentId: null },
      { id: 'fertility-deliveries', name: 'Deliveries', parentId: null },
      { id: 'notes', name: 'Notes', parentId: null }
    ]
  };
}

const visit = (content) => ({ streamIds: ['encounter-visit'], type: 'encounter/visit-v1', content });
const delivery = (content) => ({ streamIds: ['fertility-deliveries'], type: 'delivery/composite-v1', content });

describe('[EVD] entry details: composite parts and duration', () => {
  before(() => {
    resetModel();
    getModel().loadFromObject(makeModel());
  });
  after(async () => {
    resetPreferredLocales();
    resetModel();
    await getModel().load(modelURL);
  });
  afterEach(() => resetPreferredLocales());

  it('[EVD-1] lists the declared fields that hold a value, labelled, in the item order', () => {
    const parts = compositeParts(visit({ notes: 'Bring the results', kind: 'teleconsultation', reason: 'Check-up', serviceProvider: { eventId: 'o1' }, specialty: 'x' }));
    assert.deepEqual(parts, [
      { key: 'kind', label: 'Type of visit', value: 'Teleconsultation' },
      { key: 'reason', label: 'Reason', value: 'Check-up' },
      { key: 'notes', label: 'Notes', value: 'Bring the results' }
    ]);
  });

  it('[EVD-2] leaves out empty fields and reads in the preferred language', () => {
    setPreferredLocales(['fr']);
    assert.deepEqual(compositeParts(visit({ kind: 'consultation', reason: '  ', notes: null })), [
      { key: 'kind', label: 'Type de visite', value: 'Consultation' }
    ]);
  });

  it('[EVD-3] numbers in local digits, a number between select stops as the nearest option', () => {
    setPreferredLocales(['fr']);
    const parts = compositeParts(delivery({ birthWeight: 3250, score: 0.8 }));
    assert.equal(parts[0].label, 'Poids de naissance (g)');
    assert.equal(parts[0].value.replace(/\s/g, ' '), '3 250');
    assert.deepEqual(parts[1], { key: 'score', label: 'Score', value: 'High' });
  });

  it('[EVD-4] nothing for a non-composite, an unknown event or no content', () => {
    assert.deepEqual(compositeParts({ streamIds: ['notes'], type: 'note/txt', content: 'hello' }), []);
    assert.deepEqual(compositeParts({ streamIds: ['unknown'], type: 'x/y', content: { a: 1 } }), []);
    assert.deepEqual(compositeParts(visit(null)), []);
    assert.deepEqual(compositeParts(null), []);
  });

  it('[EVD-5] formatDuration: two largest parts, in the preferred language or the given locale', () => {
    assert.equal(formatDuration(45 * 60), '45 minutes');
    assert.equal(formatDuration(90 * 60), '1 hour, 30 minutes');
    assert.equal(formatDuration(3 * 86400 + 4 * 3600 + 12 * 60), '3 days, 4 hours');
    assert.equal(formatDuration(86400 + 30 * 60), '1 day, 30 minutes');
    assert.equal(formatDuration(30), '30 seconds');
    // French separates a number from its unit with a (narrow) no-break space
    const sp = (s) => s.replace(/\s/g, ' ');
    assert.equal(sp(formatDuration(2 * 3600, { locale: 'fr' })), '2 heures');
    setPreferredLocales(['fr']);
    assert.equal(sp(formatDuration(45 * 60)), '45 minutes');
    assert.equal(sp(formatDuration(3600 + 60)), '1 heure et 1 minute');
  });

  it('[EVD-6] formatDuration: empty for no duration', () => {
    assert.equal(formatDuration(0), '');
    assert.equal(formatDuration(-5), '');
    assert.equal(formatDuration(null), '');
    assert.equal(formatDuration(NaN), '');
  });
});
