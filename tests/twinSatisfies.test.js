import { assert } from './test-utils/deps-node.js';
import { HDSModel } from '../ts/HDSModel/HDSModel.ts';

/**
 * [TWIN] Twin-aware "was this recorded?" matching.
 *
 * A concept can be recorded at two fidelities on one stream: a presence marker
 * (`activity/plain`) for sources that only know an occurrence, and a graded
 * twin (`ratio/proportion`). data-model 3.2.0 published that contract in prose;
 * nothing links a pair in machine-readable form, so the shared `streamId` is
 * the only signal a consumer has.
 *
 * `B-2026-09-15-5`: a form spec was migrated to the graded items while the
 * bridge feeding it writes presence flags, so completion reported every one of
 * them missing and the subject was asked to re-enter what the bridge had
 * already sent. Live prod data at the time: 0 graded events, 17 presence.
 *
 * The fixtures mirror the real pack, including the deliberately awkward LH pair
 * that shares a stream while meaning different units.
 */
function load (data) {
  const model = new HDSModel('http://fake/pack.json');
  model.loadFromObject(data);
  return model;
}

function twinModel () {
  return load({
    items: {
      'symptom-pain-headache': {
        version: 'v1',
        deprecated: true,
        label: { en: 'Headache' },
        description: { en: 'Presence marker; use symptom-pain-headache-severity when a severity is known.' },
        streamId: 'symptom-pain-headache',
        eventType: 'activity/plain',
        type: 'checkbox',
        repeatable: 'unlimited'
      },
      'symptom-pain-headache-severity': {
        version: 'v1',
        label: { en: 'Headache' },
        streamId: 'symptom-pain-headache',
        eventType: 'ratio/proportion',
        type: 'number',
        repeatable: 'unlimited'
      },
      'body-weight': {
        version: 'v1',
        label: { en: 'Weight' },
        streamId: 'body-weight',
        eventType: 'mass/kg',
        type: 'number',
        repeatable: 'unlimited'
      }
    },
    streams: [
      { id: 'symptom-pain-headache', name: 'Headache' },
      { id: 'body-weight', name: 'Weight' }
    ]
  });
}

const ev = (type, streamId) => ({ type, streamIds: [streamId] });

describe('[TWIN] satisfyingEventTypes / satisfiedByEvent', () => {
  it('[TWIN1] the graded item accepts its presence twin', () => {
    const model = twinModel();
    const graded = model.itemsDefs.forKey('symptom-pain-headache-severity');
    assert.deepEqual(graded.satisfyingEventTypes.sort(), ['activity/plain', 'ratio/proportion']);
    assert.equal(graded.satisfiedByEvent(ev('activity/plain', 'symptom-pain-headache')), true);
  });

  it('[TWIN2] and still accepts its own type', () => {
    const graded = twinModel().itemsDefs.forKey('symptom-pain-headache-severity');
    assert.equal(graded.satisfiedByEvent(ev('ratio/proportion', 'symptom-pain-headache')), true);
  });

  it('[TWIN3] an item alone on its stream is unchanged', () => {
    // The widening must not quietly loosen matching for the ordinary case.
    const weight = twinModel().itemsDefs.forKey('body-weight');
    assert.deepEqual(weight.satisfyingEventTypes, ['mass/kg']);
    assert.equal(weight.satisfiedByEvent(ev('activity/plain', 'body-weight')), false);
  });

  it('[TWIN4] a matching type on a DIFFERENT stream does not satisfy', () => {
    const graded = twinModel().itemsDefs.forKey('symptom-pain-headache-severity');
    assert.equal(graded.satisfiedByEvent(ev('ratio/proportion', 'symptom-pain-backache')), false);
  });

  it('[TWIN5] matchesEvent keeps its strict meaning', () => {
    // satisfiedByEvent answers "was the concept recorded"; matchesEvent answers
    // "is this event THIS item". Widening the first must not widen the second,
    // or forEvent-based resolution would start returning the wrong itemDef.
    const model = twinModel();
    const graded = model.itemsDefs.forKey('symptom-pain-headache-severity');
    const presenceEvent = ev('activity/plain', 'symptom-pain-headache');
    assert.equal(graded.satisfiedByEvent(presenceEvent), true);
    assert.equal(graded.matchesEvent(presenceEvent), false);
    assert.equal(model.itemsDefs.forEvent(presenceEvent).key, 'symptom-pain-headache');
  });

  it('[TWIN6] forStreamId returns every item on the stream, deprecated included', () => {
    const model = twinModel();
    const keys = model.itemsDefs.forStreamId('symptom-pain-headache').map(d => d.key).sort();
    assert.deepEqual(keys, ['symptom-pain-headache', 'symptom-pain-headache-severity']);
    assert.deepEqual(model.itemsDefs.forStreamId('nope'), []);
  });

  it('[TWIN7] units that share a stream are collected, and the doc says not to read across them', () => {
    // body-urine-hormones-lh (IU/L) and fertility-hormone-lh (mg/L) really do
    // share a stream in the published pack. Both count as "LH was recorded";
    // neither may be read as the other. This pins the recorded-vs-read line.
    const model = load({
      items: {
        'body-urine-hormones-lh': { version: 'v2', label: { en: 'LH' }, streamId: 'body-urine-hormones-lh', eventType: 'concentration/iu-l', type: 'number', repeatable: 'any' },
        'fertility-hormone-lh': { version: 'v1', deprecated: true, label: { en: 'LH legacy' }, streamId: 'body-urine-hormones-lh', eventType: 'concentration/mg-l', type: 'number', repeatable: 'any' }
      },
      streams: [{ id: 'body-urine-hormones-lh', name: 'LH' }]
    });
    const active = model.itemsDefs.forKey('body-urine-hormones-lh');
    assert.deepEqual(active.satisfyingEventTypes.sort(), ['concentration/iu-l', 'concentration/mg-l']);
    // …but resolution still tells them apart, which is what protects the value.
    assert.equal(model.itemsDefs.forEvent(ev('concentration/mg-l', 'body-urine-hormones-lh')).key, 'fertility-hormone-lh');
  });
});
