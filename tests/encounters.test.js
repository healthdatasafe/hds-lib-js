import { assert } from './test-utils/deps-node.js';
import { eventToShortText, contentEventIds, withRelatedMirror, checkRelatedMirror, ENCOUNTER_VISIT, PROVIDER_PRACTITIONER, PROVIDER_ORGANIZATION, IDENTIFIER_SYSTEM_GLN, IDENTIFIER_SYSTEM_ZSR } from '../ts/index.ts';
import { getModel, resetModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';
import { setPreferredLocales, resetPreferredLocales } from '../ts/localizeText.ts';

/**
 * Care encounters and providers (site-agents#24): event ids in content mirrored in `clientData.related`, provider
 * GLN / ZSR mirrored in `clientData.hdsGln` / `hdsZsr`, short texts keyed on the eventType.
 */

const modelURL = 'https://model.datasafe.dev/pack.json';
const XDS = 'file/xds-v1';

const kindOptions = [
  { value: 'consultation', label: { en: 'Consultation', fr: 'Consultation' } },
  { value: 'hospital-stay', label: { en: 'Hospital stay', fr: 'Séjour hospitalier' } },
  // differs from the built-in "Other", so a test can tell the item's label is read
  { value: 'other', label: { en: 'Other care', fr: 'Autre soin' } }
];

function makeModel ({ withItems = true } = {}) {
  const items = {
    'encounter-visit': {
      version: 'v1',
      label: { en: 'Care visit' },
      description: { en: 'A consultation, hospital stay or other time you received care.' },
      streamId: 'encounter-visit',
      eventType: ENCOUNTER_VISIT,
      type: 'composite',
      composite: {
        kind: { type: 'select', label: { en: 'Type of visit', fr: 'Type de visite' }, options: kindOptions },
        reason: { type: 'text', label: { en: 'Reason', fr: 'Motif' }, canBeNull: true },
        notes: { type: 'text', label: { en: 'Notes', fr: 'Notes' }, canBeNull: true }
      }
    },
    'encounter-provider-person': {
      version: 'v1',
      label: { en: 'Doctor or therapist' },
      description: { en: 'A doctor, therapist or other person who cares for you.' },
      streamId: 'encounter-provider-person',
      eventType: PROVIDER_PRACTITIONER,
      type: 'composite',
      composite: { name: { type: 'text', label: { en: 'Name', fr: 'Nom' } } }
    },
    'encounter-provider-organization': {
      version: 'v1',
      label: { en: 'Clinic, hospital or practice' },
      description: { en: 'A practice, clinic, hospital or laboratory that cares for you.' },
      streamId: 'encounter-provider-organization',
      eventType: PROVIDER_ORGANIZATION,
      type: 'composite',
      composite: { name: { type: 'text', label: { en: 'Name', fr: 'Nom' } } }
    }
  };
  return {
    items: withItems ? items : {},
    streams: [
      { id: 'encounter', name: 'Care encounters and providers', parentId: null },
      { id: 'encounter-visit', name: 'Visits and stays', parentId: 'encounter' },
      { id: 'encounter-provider', name: 'Care providers', parentId: 'encounter' },
      { id: 'encounter-provider-person', name: 'Doctors and therapists', parentId: 'encounter-provider' },
      { id: 'encounter-provider-organization', name: 'Clinics, hospitals and practices', parentId: 'encounter-provider' }
    ]
  };
}

const cardiology = { system: 'http://snomed.info/sct', code: '394579002', display: 'Cardiology' };
const medregCardiology = { system: 'urn:oid:2.16.756.5.30.1.127.3.5', code: '1025', display: 'Cardiology' };
const medregGeneral = { system: 'urn:oid:2.16.756.5.30.1.127.3.5', code: '1040', display: 'General medical practitioner' };
const gln = (value) => ({ system: IDENTIFIER_SYSTEM_GLN, value });
const zsr = (value) => ({ system: IDENTIFIER_SYSTEM_ZSR, value });

const visit = (content, clientData, streamIds = ['encounter-visit']) => ({ streamIds, type: ENCOUNTER_VISIT, content, clientData });
const practitioner = (content, clientData) => ({ streamIds: ['encounter-provider-person'], type: PROVIDER_PRACTITIONER, content, clientData });
const organization = (content, clientData) => ({ streamIds: ['encounter-provider-organization'], type: PROVIDER_ORGANIZATION, content, clientData });
const xds = (content, clientData) => ({ streamIds: ['documents'], type: XDS, content, clientData });

describe('[ENC-LIB] care encounters and providers', () => {
  before(() => {
    resetModel();
    getModel().loadFromObject(makeModel());
  });
  after(async () => {
    resetModel();
    await getModel().load(modelURL);
  });

  it('[ENC-LIB-1] contentEventIds reads the six id fields, nothing on other types', () => {
    assert.deepEqual(contentEventIds(xds({ title: 'Report', supersedes: ['d0'], authors: [{ name: 'Dr A', eventId: 'p1' }, { name: 'Lab' }], encounterId: 'v1' })), [
      { field: 'supersedes', eventId: 'd0' },
      { field: 'authors.eventId', eventId: 'p1' },
      { field: 'encounterId', eventId: 'v1' }
    ]);
    assert.deepEqual(contentEventIds(visit({ kind: 'consultation', participants: [{ eventId: 'p1', role: 'attender' }, { name: 'Dr B' }], serviceProvider: { eventId: 'o1', name: 'HUG' } })), [
      { field: 'participants.eventId', eventId: 'p1' },
      { field: 'serviceProvider.eventId', eventId: 'o1' }
    ]);
    assert.deepEqual(contentEventIds(practitioner({ name: 'Dr A', organizations: [{ eventId: 'o1' }, { name: 'Cabinet' }] })), [
      { field: 'organizations.eventId', eventId: 'o1' }
    ]);
    // a field is read only on the type that declares it
    assert.deepEqual(contentEventIds(visit({ kind: 'other', encounterId: 'v0', organizations: [{ eventId: 'o1' }] })), []);
    assert.deepEqual(contentEventIds(organization({ name: 'HUG' })), []);
    assert.deepEqual(contentEventIds({ type: 'note/txt', content: 'hello' }), []);
    assert.deepEqual(contentEventIds(visit(null)), []);
    assert.deepEqual(contentEventIds(null), []);
  });

  it('[ENC-LIB-2] withRelatedMirror adds content ids, keeps other keys, does not change the event', () => {
    const event = visit({ kind: 'consultation', participants: [{ eventId: 'p1' }], serviceProvider: { eventId: 'o1' } }, { sourceKey: 'tool:visit:1', related: { doc1: true } });
    assert.deepEqual(withRelatedMirror(event), { sourceKey: 'tool:visit:1', related: { doc1: true, p1: true, o1: true } });
    assert.deepEqual(event.clientData, { sourceKey: 'tool:visit:1', related: { doc1: true } });
    assert.deepEqual(withRelatedMirror(xds({ supersedes: ['d0'], authors: [{ eventId: 'p1' }], encounterId: 'v1' })), { related: { d0: true, p1: true, v1: true } });
    // no id, no previous content: clientData as it was, no empty `related` added
    assert.deepEqual(withRelatedMirror(visit({ kind: 'other' })), {});
    assert.deepEqual(withRelatedMirror(visit({ kind: 'other' }, { sourceKey: 'k' })), { sourceKey: 'k' });
  });

  it('[ENC-LIB-2b] withRelatedMirror on update removes only the ids that left content', () => {
    const previous = { kind: 'consultation', participants: [{ eventId: 'p1' }, { eventId: 'p2' }], serviceProvider: { eventId: 'o1' } };
    const updated = visit({ kind: 'consultation', participants: [{ eventId: 'p1' }, { eventId: 'o1' }] }, { related: { p1: true, p2: true, o1: true, doc1: true } });
    // p2 left content; o1 moved from serviceProvider to participants and stays; doc1 was never in content and stays
    assert.deepEqual(withRelatedMirror(updated, previous), { related: { p1: true, o1: true, doc1: true } });
    // every id gone: `related` written whole, empty
    assert.deepEqual(withRelatedMirror(visit({ kind: 'other' }, { related: { p1: true, p2: true, o1: true } }), previous), { related: {} });
  });

  it('[ENC-LIB-2c] withRelatedMirror sets and removes hdsGln / hdsZsr on providers', () => {
    const identifiers = [gln('7601000000000'), zsr('A123456'), zsr('B654321')];
    assert.deepEqual(withRelatedMirror(practitioner({ name: 'Dr A', identifiers })), { hdsGln: '7601000000000', hdsZsr: 'A123456' });
    // an existing value still among the identifiers is kept
    assert.deepEqual(withRelatedMirror(practitioner({ name: 'Dr A', identifiers }, { hdsZsr: 'B654321' })), { hdsZsr: 'B654321', hdsGln: '7601000000000' });
    // a stale value is replaced, a key whose identifier is gone removed
    assert.deepEqual(withRelatedMirror(practitioner({ name: 'Dr A', identifiers: [zsr('A123456')] }, { hdsGln: '7601000000001', hdsZsr: 'Z000000', sourceKey: 'k' })),
      { hdsZsr: 'A123456', sourceKey: 'k' });
    // on an update (previousContent given) a removed key is null: events.update only deletes a clientData key on null
    assert.deepEqual(withRelatedMirror(practitioner({ name: 'Dr A', identifiers: [zsr('A123456')] }, { hdsGln: '7601000000001', hdsZsr: 'A123456' }),
      { name: 'Dr A', identifiers: [gln('7601000000001'), zsr('A123456')] }), { hdsGln: null, hdsZsr: 'A123456' });
    assert.deepEqual(withRelatedMirror(organization({ name: 'HUG', identifiers: [gln('7601000000017'), { system: 'urn:oid:2.16.756.5.35', value: 'CHE123456789' }] })), { hdsGln: '7601000000017' });
    // with organizations[] too
    assert.deepEqual(withRelatedMirror(practitioner({ name: 'Dr A', organizations: [{ eventId: 'o1' }], identifiers: [gln('7601000000000')] })),
      { related: { o1: true }, hdsGln: '7601000000000' });
    // never on another type
    assert.deepEqual(withRelatedMirror(visit({ kind: 'other', identifiers: [gln('7601000000000')] }, { hdsGln: 'x' })), { hdsGln: 'x' });
  });

  it('[ENC-LIB-3] checkRelatedMirror: missing-related', () => {
    const event = visit({ kind: 'consultation', participants: [{ eventId: 'p1' }], serviceProvider: { eventId: 'o1' } }, { related: { o1: true } });
    assert.deepEqual(checkRelatedMirror(event), [{ code: 'missing-related', field: 'participants.eventId', eventId: 'p1' }]);
    assert.deepEqual(checkRelatedMirror({ ...event, clientData: withRelatedMirror(event) }), []);
    assert.deepEqual(checkRelatedMirror(xds({ supersedes: ['d0'], encounterId: 'v1' })), [
      { code: 'missing-related', field: 'supersedes', eventId: 'd0' },
      { code: 'missing-related', field: 'encounterId', eventId: 'v1' }
    ]);
    assert.deepEqual(checkRelatedMirror(visit({ kind: 'other' })), []);
    assert.deepEqual(checkRelatedMirror({ type: 'note/txt', content: 'x' }), []);
  });

  it('[ENC-LIB-3b] checkRelatedMirror: wrong-target-type, given the targets', () => {
    const content = { kind: 'consultation', participants: [{ eventId: 'p1' }, { eventId: 'p2' }], serviceProvider: { eventId: 'o1' } };
    const event = visit(content, withRelatedMirror(visit(content)));
    const good = { p1: { type: PROVIDER_PRACTITIONER }, p2: { type: PROVIDER_PRACTITIONER }, o1: { type: PROVIDER_ORGANIZATION } };
    assert.deepEqual(checkRelatedMirror(event, good), []);
    assert.deepEqual(checkRelatedMirror(event, new Map(Object.entries(good))), []);
    // an organization is never a participant (FHIR Encounter.participant.individual): it goes in serviceProvider
    assert.deepEqual(checkRelatedMirror(event, { ...good, p2: { type: PROVIDER_ORGANIZATION } }),
      [{ code: 'wrong-target-type', field: 'participants.eventId', eventId: 'p2', targetType: PROVIDER_ORGANIZATION, expectedTypes: [PROVIDER_PRACTITIONER] }]);
    const bad = { p1: { type: ENCOUNTER_VISIT }, o1: { type: PROVIDER_PRACTITIONER } };
    const expected = [
      { code: 'wrong-target-type', field: 'participants.eventId', eventId: 'p1', targetType: ENCOUNTER_VISIT, expectedTypes: [PROVIDER_PRACTITIONER] },
      { code: 'wrong-target-type', field: 'serviceProvider.eventId', eventId: 'o1', targetType: PROVIDER_PRACTITIONER, expectedTypes: [PROVIDER_ORGANIZATION] }
    ];
    // p2 is not among the targets (dangling or unreadable): not an issue
    assert.deepEqual(checkRelatedMirror(event, bad), expected);
    assert.deepEqual(checkRelatedMirror(event, new Map(Object.entries(bad))), expected);

    const doc = { supersedes: ['d0'], authors: [{ eventId: 'o1' }], encounterId: 'v1' };
    const docEvent = xds(doc, withRelatedMirror(xds(doc)));
    assert.deepEqual(checkRelatedMirror(docEvent, { d0: { type: XDS }, o1: { type: PROVIDER_ORGANIZATION }, v1: { type: ENCOUNTER_VISIT } }), []);
    assert.deepEqual(checkRelatedMirror(docEvent, { d0: { type: 'note/txt' }, o1: { type: ENCOUNTER_VISIT }, v1: { type: PROVIDER_ORGANIZATION } }).map((i) => [i.field, i.targetType]), [
      ['supersedes', 'note/txt'],
      ['authors.eventId', ENCOUNTER_VISIT],
      ['encounterId', PROVIDER_ORGANIZATION]
    ]);

    const person = { name: 'Dr A', organizations: [{ eventId: 'p9' }] };
    assert.deepEqual(checkRelatedMirror(practitioner(person, { related: { p9: true } }), { p9: { type: PROVIDER_PRACTITIONER } }),
      [{ code: 'wrong-target-type', field: 'organizations.eventId', eventId: 'p9', targetType: PROVIDER_PRACTITIONER, expectedTypes: [PROVIDER_ORGANIZATION] }]);
  });

  it('[ENC-LIB-3c] checkRelatedMirror: missing-provider-key', () => {
    const identifiers = [gln('7601000000000'), zsr('A123456'), zsr('B654321')];
    assert.deepEqual(checkRelatedMirror(practitioner({ name: 'Dr A', identifiers })), [
      { code: 'missing-provider-key', key: 'hdsGln', value: '7601000000000' },
      { code: 'missing-provider-key', key: 'hdsZsr', value: 'A123456' }
    ]);
    // any of its ZSR values mirrors it
    assert.deepEqual(checkRelatedMirror(practitioner({ name: 'Dr A', identifiers }, { hdsGln: '7601000000000', hdsZsr: 'B654321' })), []);
    assert.deepEqual(checkRelatedMirror(organization({ name: 'HUG' })), []);
    const filled = practitioner({ name: 'Dr A', identifiers });
    assert.deepEqual(checkRelatedMirror({ ...filled, clientData: withRelatedMirror(filled) }), []);
  });

  it('[ENC-LIB-3d] checkRelatedMirror: stale-provider-key, a key no identifier holds', () => {
    // set to another GLN: another writer's lookup by 7601000000000 would land on this organization
    assert.deepEqual(checkRelatedMirror(organization({ name: 'HUG', identifiers: [gln('7601000000017')] }, { hdsGln: '7601000000000' })),
      [{ code: 'stale-provider-key', key: 'hdsGln', value: '7601000000000' }]);
    // the identifier left content, the key stayed
    assert.deepEqual(checkRelatedMirror(practitioner({ name: 'Dr A', identifiers: [zsr('A123456')] }, { hdsGln: '7601000000000', hdsZsr: 'A123456' })),
      [{ code: 'stale-provider-key', key: 'hdsGln', value: '7601000000000' }]);
    assert.deepEqual(checkRelatedMirror(practitioner({ name: 'Dr A' }, { hdsZsr: 'B654321' })),
      [{ code: 'stale-provider-key', key: 'hdsZsr', value: 'B654321' }]);
    // null is a key being removed (withRelatedMirror on update): not stale
    assert.deepEqual(checkRelatedMirror(practitioner({ name: 'Dr A' }, { hdsGln: null })), []);
    // withRelatedMirror fixes it
    const stale = organization({ name: 'HUG', identifiers: [gln('7601000000017')] }, { hdsGln: '7601000000000' });
    assert.deepEqual(checkRelatedMirror({ ...stale, clientData: withRelatedMirror(stale) }), []);
    // never on another type
    assert.deepEqual(checkRelatedMirror(visit({ kind: 'other' }, { hdsGln: '7601000000000' })), []);
  });

  it('[ENC-LIB-4] eventToShortText with the items loaded', () => {
    assert.equal(eventToShortText(visit({ kind: 'hospital-stay', specialty: cardiology })), 'Hospital stay · Cardiology');
    assert.equal(eventToShortText(visit({ kind: 'consultation', reason: 'Chest pain' })), 'Consultation');
    // the item's option label wins over the built-in one, also on a stream no item resolves to
    assert.equal(eventToShortText(visit({ kind: 'other' })), 'Other care');
    assert.equal(eventToShortText(visit({ kind: 'other' }, undefined, ['encounter'])), 'Other care');
    assert.equal(eventToShortText(visit({ kind: 'future-kind' })), 'future-kind');
    assert.equal(eventToShortText(visit({ kind: 'consultation', specialty: { system: cardiology.system, code: cardiology.code } })), 'Consultation');
    // the first specialty as printed
    assert.equal(eventToShortText(practitioner({ name: 'Dr méd. Anne Muller', specialties: [medregCardiology, medregGeneral] })), 'Dr méd. Anne Muller · Cardiology');
    assert.equal(eventToShortText(practitioner({ name: 'Dr méd. Anne Muller', specialties: [{ system: medregCardiology.system, code: medregCardiology.code }, medregGeneral] })), 'Dr méd. Anne Muller');
    assert.equal(eventToShortText(practitioner({ name: 'Dr méd. Anne Muller', identifiers: [gln('7601000000000')] })), 'Dr méd. Anne Muller');
    assert.equal(eventToShortText(organization({ name: 'HUG, Service de cardiologie', identifiers: [gln('7601000000017')] })), 'HUG, Service de cardiologie');
    setPreferredLocales(['fr']);
    try {
      assert.equal(eventToShortText(visit({ kind: 'hospital-stay', specialty: cardiology })), 'Séjour hospitalier · Cardiology');
      assert.equal(eventToShortText(visit({ kind: 'other' })), 'Autre soin');
    } finally {
      resetPreferredLocales();
    }
  });

  describe('without the items', () => {
    before(() => {
      resetModel();
      getModel().loadFromObject(makeModel({ withItems: false }));
    });
    after(() => {
      resetModel();
      getModel().loadFromObject(makeModel());
    });

    it('[ENC-LIB-4b] eventToShortText reads the same from the built-in labels, never [object Object]', () => {
      assert.equal(eventToShortText(visit({ kind: 'hospital-stay', specialty: cardiology })), 'Hospital stay · Cardiology');
      assert.equal(eventToShortText(visit({ kind: 'day-case' })), 'Day hospital');
      assert.equal(eventToShortText(visit({ kind: 'other' })), 'Other');
      assert.equal(eventToShortText(visit({ kind: 'toString' })), 'toString');
      assert.equal(eventToShortText(visit({ specialty: cardiology })), 'Cardiology');
      assert.equal(eventToShortText(practitioner({ name: 'Dr méd. Anne Muller', specialties: [medregCardiology] })), 'Dr méd. Anne Muller · Cardiology');
      assert.equal(eventToShortText(practitioner({ given: 'Anne Marie', family: 'Muller' })), 'Anne Marie Muller');
      // a non-array specialties is not read
      assert.equal(eventToShortText(practitioner({ name: 'Dr A', specialties: medregCardiology })), 'Dr A');
      assert.equal(eventToShortText(organization({ name: 'HUG' })), 'HUG');
      setPreferredLocales(['fr']);
      try {
        assert.equal(eventToShortText(visit({ kind: 'hospital-stay', specialty: cardiology })), 'Séjour hospitalier · Cardiology');
        assert.equal(eventToShortText(visit({ kind: 'home-visit' })), 'Visite à domicile');
      } finally {
        resetPreferredLocales();
      }
      for (const event of [
        visit({ kind: 'consultation', participants: [{ name: 'Dr B' }], serviceProvider: { name: 'HUG' } }),
        visit({ participants: [{ eventId: 'p1' }] }),
        practitioner({ identifiers: [gln('7601000000000')] }),
        organization({ identifiers: [gln('7601000000017')] })
      ]) {
        const text = eventToShortText(event);
        assert.ok(text == null || !text.includes('[object'), String(text));
      }
    });
  });
});
