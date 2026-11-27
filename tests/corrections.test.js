import { assert } from './test-utils/deps-node.js';
import { corrections, appTemplates, getHDSModel } from '../ts/index.ts';
import { offerStreamsToCreate } from '../ts/appTemplates/offerStreams.ts';
import { setPreferredLocales, resetPreferredLocales } from '../ts/localizeText.ts';

/**
 * A professional's correction of one entry, data-model 4.43.0 (plan 143, CORRECTIONS.md). Until that pack is published,
 * the published pack is patched with the root, the item, the eventType and the vocabulary.
 */
describe('[CORR] corrections of an entry', () => {
  const { ENTRY_CORRECTION, CORRECTIONS_ROOT_ID } = corrections;
  const CHILD = 'corr-4k2m9x0q7a1b';
  let published;
  let model;

  before(async () => {
    model = getHDSModel();
    if (!model.isLoaded) await model.load('https://model.datasafe.dev/pack.json');
    published = structuredClone(model.modelData);
    const pack = structuredClone(published);
    if (!pack.streams.some((s) => s.id === CORRECTIONS_ROOT_ID)) {
      pack.streams.push({ id: CORRECTIONS_ROOT_ID, name: 'Corrections from your contacts', parentId: null });
    }
    pack.items['entry-correction'] = {
      version: 'v1', type: 'system', label: { en: 'Correction of an entry' }, description: { en: 'd' }, streamId: CORRECTIONS_ROOT_ID, eventType: ENTRY_CORRECTION, repeatable: 'unlimited'
    };
    pack.eventTypes.types[ENTRY_CORRECTION] ??= { type: 'object' };
    pack.vocabularies ??= {};
    pack.vocabularies['professional-role'] ??= {
      binds: [{ eventType: ENTRY_CORRECTION, path: 'authorRole' }],
      values: { physician: { label: { en: 'Physician', fr: 'Médecin' } }, 'health-educator': { label: { en: 'Health educator', fr: 'Éducateur ou éducatrice en santé' } }, other: { label: { en: 'Other', fr: 'Autre' } } }
    };
    model.loadFromObject(pack);
  });
  after(() => { getHDSModel().loadFromObject(published); });
  afterEach(() => { resetPreferredLocales(); });

  const entry = () => ({
    id: 'ckentry0001',
    streamIds: ['body-vulva-bleeding'],
    type: 'ratio/proportion',
    time: 1773316800,
    modified: 1773320000.5,
    content: 0.5,
    clientData: { hdsTimePrecision: 'day' }
  });
  const change = (over = {}) => corrections.buildCorrection({
    streamId: CHILD,
    kind: 'change',
    authorRole: 'health-educator',
    itemKey: 'body-vulva-bleeding',
    entry: entry(),
    corrected: { type: 'ratio/proportion', content: 0 },
    comment: 'No bleeding on this day: the **stamp** is green.',
    markdown: true,
    about: 'ckdoc0001',
    anchor: { attachmentId: 'ckdoc0001a', page: 1 },
    ...over
  });

  describe('[CORR-IDS] the children', () => {
    it('[CORR-IDS-1] corr- + 12 lowercase base36, random', () => {
      const a = corrections.newCorrectionStreamId();
      const b = corrections.newCorrectionStreamId();
      assert.ok(corrections.isCorrectionStreamId(a), a);
      assert.notEqual(a, b);
      for (const id of ['corr-4K2M9X0Q7A1B', 'corr-4k2m9x0q7a1', 'share-4k2m9x0q7a1b', 'entry-corrections', null]) {
        assert.equal(corrections.isCorrectionStreamId(id), false, String(id));
      }
    });

    it('[CORR-IDS-2] forEvent resolves a child to the item; an unknown stream still throws', () => {
      const item = model.itemsDefs.forEvent({ streamIds: [CHILD], type: ENTRY_CORRECTION });
      assert.equal(item.key, 'entry-correction');
      assert.equal(model.itemsDefs.forEvent({ streamIds: ['corr-zz'], type: ENTRY_CORRECTION }, false), null);
      assert.throws(() => model.itemsDefs.forEvent({ streamIds: ['my-app-corrections'], type: ENTRY_CORRECTION }));
    });

    it('[CORR-IDS-3] offerStreamsToCreate puts a child under the root, named by its id', () => {
      const out = offerStreamsToCreate([{ streamId: CHILD, level: 'contribute', defaultName: 'Corrections by Anna' }], model.streams);
      assert.deepEqual(out, [
        { id: CORRECTIONS_ROOT_ID, name: 'Corrections from your contacts', parentId: undefined },
        { id: CHILD, name: CHILD, parentId: CORRECTIONS_ROOT_ID }
      ]);
      assert.ok(appTemplates);
    });

    it('[CORR-IDS-4] checkOfferedCorrectionStreams refuses what CORRECTIONS.md lists', () => {
      const check = (perms, ctx) => corrections.checkOfferedCorrectionStreams(perms, { singleUse: true, ...ctx }).map((i) => i.code);
      assert.deepEqual(check([{ streamId: CHILD, level: 'contribute' }, { streamId: CORRECTIONS_ROOT_ID, level: 'read' }]), []);
      assert.deepEqual(check([{ streamId: CORRECTIONS_ROOT_ID, level: 'contribute' }]), [], 'the minted ask, never granted as such');
      assert.equal(corrections.asksForCorrections([{ streamId: CORRECTIONS_ROOT_ID, level: 'contribute' }]), true);
      assert.equal(corrections.asksForCorrections([{ streamId: CORRECTIONS_ROOT_ID, level: 'read' }, { streamId: CHILD, level: 'contribute' }]), false);
      assert.deepEqual(check([{ streamId: CORRECTIONS_ROOT_ID, level: 'manage' }]), ['root-level']);
      assert.deepEqual(check([{ streamId: CORRECTIONS_ROOT_ID, level: 'create-only' }]), ['root-level']);
      assert.deepEqual(check([{ streamId: CHILD, level: 'read' }]), ['child-not-contribute']);
      assert.deepEqual(check([{ streamId: CHILD, level: 'contribute' }], { relationship: 'r1', existing: { [CHILD]: 'r2' } }), ['child-taken']);
      assert.deepEqual(check([{ streamId: CHILD, level: 'contribute' }], { relationship: 'r1', existing: new Map([[CHILD, 'r1']]) }), [], 'its own, on a scope update');
      assert.deepEqual(check([{ streamId: CHILD, level: 'contribute' }], { namedByOthers: [CHILD] }), ['child-taken']);
      assert.deepEqual(check([{ streamId: CHILD, level: 'contribute' }, { streamId: 'corr-000000000001', level: 'contribute' }]), ['several-children']);
      assert.deepEqual(check([{ streamId: CHILD, level: 'contribute' }], { singleUse: false }), ['not-single-use']);
      assert.deepEqual(check([{ streamId: CHILD, level: 'contribute' }], { singleUse: false, relationship: 'r1', existing: { [CHILD]: 'r1' } }), [], 'an existing child of its own, on a reusable invite');
      assert.deepEqual(check([{ streamId: CHILD, level: 'contribute' }], { relationship: 'r1', existing: { [CHILD]: null } }), ['child-taken'], 'unmarked, not named by its access');
      assert.deepEqual(check([{ streamId: CHILD, level: 'contribute' }], { relationship: 'r1', existing: { [CHILD]: null }, namedByThis: [CHILD] }), [], 'an interrupted accept');
    });
  });

  describe('[CORR-BLD] building and checking', () => {
    it('[CORR-BLD-1] a change: time and entryModified from the entry, ids mirrored, anchor and markdown', () => {
      const e = change();
      assert.deepEqual(e.streamIds, [CHILD]);
      assert.equal(e.type, ENTRY_CORRECTION);
      assert.equal(e.time, 1773316800);
      assert.equal(e.content.entryId, 'ckentry0001');
      assert.equal(e.content.entryModified, 1773320000.5);
      assert.deepEqual(e.clientData.related, { ckentry0001: true, ckdoc0001: true });
      assert.deepEqual(e.clientData.hdsSourceAnchor, { eventId: 'ckdoc0001', attachmentId: 'ckdoc0001a', page: 1 });
      assert.equal(e.clientData.hdsTimePrecision, 'day');
      assert.equal(corrections.isMarkdown(e), true);
      assert.equal(corrections.formattedText(e), 'No bleeding on this day: the **stamp** is green.');
      assert.deepEqual(corrections.checkCorrection(e, { entry: entry() }), []);
    });

    it('[CORR-BLD-2] an add and a remove', () => {
      const add = corrections.buildCorrection({
        streamId: CHILD, kind: 'add', authorRole: 'physician', itemKey: 'body-vulva-bleeding', corrected: { type: 'ratio/proportion', content: 0.25 }, time: 1773403200, timePrecision: 'day'
      });
      assert.equal(add.time, 1773403200);
      assert.equal(add.content.entryId, undefined);
      assert.equal(add.clientData.related, undefined);
      const remove = corrections.buildCorrection({ streamId: CHILD, kind: 'remove', authorRole: 'other', itemKey: 'body-vulva-bleeding', entry: entry() });
      assert.equal(remove.content.corrected, undefined);
      assert.deepEqual(remove.clientData.related, { ckentry0001: true });
    });

    it('[CORR-BLD-3] refuses what a writer MUST NOT write', () => {
      const codes = (fn) => { try { fn(); } catch (e) { return e.innerObject?.issues?.map((i) => i.code + (i.field ? ':' + i.field : '')) ?? e.message; } return []; };
      assert.deepEqual(codes(() => change({ streamId: 'my-app-corrections' })), ['not-on-correction-child']);
      assert.deepEqual(codes(() => change({ itemKey: 'no-such-item' })), ['unknown-item']);
      assert.deepEqual(codes(() => change({ corrected: { type: 'temperature/c', content: 36.5 } })), ['corrected-type-not-of-item']);
      assert.deepEqual(codes(() => change({ itemKey: 'entry-correction', corrected: { type: ENTRY_CORRECTION, content: {} } })), ['item-not-correctable', 'entry-mismatch']);
      assert.deepEqual(codes(() => corrections.buildCorrection({ streamId: CHILD, kind: 'add', authorRole: 'physician', itemKey: 'body-vulva-bleeding', corrected: { time: 1 }, time: 1 })), ['field-for-kind:corrected.content', 'field-for-kind:corrected.time']);
      assert.deepEqual(codes(() => change({ corrected: { time: 1, clientData: { hdsRefRange: {} } } })), ['corrected-client-data']);
      const invalid = codes(() => corrections.buildCorrection({ streamId: CHILD, kind: 'change', authorRole: 'physician', itemKey: 'body-vulva-bleeding', entry: entry(), corrected: { type: 'ratio/proportion', content: 'x' } }, { validateContent: (t, c) => typeof c === 'number' }));
      assert.deepEqual(invalid, ['invalid-content']);
    });

    it('[CORR-BLD-4] a reader checks where it counts and the mirror', () => {
      const e = change();
      assert.deepEqual(corrections.checkCorrection({ ...e, streamIds: ['body-vulva-bleeding'] }).map((i) => i.code), ['not-on-correction-child']);
      assert.deepEqual(corrections.checkCorrection({ ...e, clientData: { ...e.clientData, related: {} } }).map((i) => i.code), ['missing-related', 'missing-related']);
      assert.deepEqual(corrections.checkCorrection({ ...e, clientData: { ...e.clientData, hdsSourceAnchor: { eventId: 'other', attachmentId: 'a', page: 1 } } }).map((i) => i.code), ['anchor-not-about']);
      assert.deepEqual(corrections.checkCorrection(e, { entry: { ...entry(), id: 'another' } }).map((i) => i.code), ['entry-mismatch']);
      assert.deepEqual(corrections.checkCorrection({ ...e, content: { ...e.content, authorRole: 'astrologer' } }), [], 'a reader reads an unknown role as other');
      assert.deepEqual(corrections.checkCorrection({ ...e, content: { ...e.content, authorRole: 'astrologer' } }, { writer: true }).map((i) => i.code), ['unknown-role']);
      assert.throws(() => change({ authorRole: 'astrologer' }), /unknown-role/);
      assert.deepEqual(corrections.checkCorrection({ type: 'note/txt' }).map((i) => i.code), ['wrong-type']);
    });
  });

  describe('[CORR-CUR] current corrections', () => {
    const ev = (id, created, over = {}) => ({ id, streamIds: [CHILD], type: ENTRY_CORRECTION, created, content: { kind: 'change', entryId: 'e1', itemKey: 'body-vulva-bleeding' }, ...over });

    it('[CORR-CUR-1] a replaced one is not current, even when the replacement is trashed', () => {
      const a = ev('a', 1);
      const b = ev('b', 2, { content: { kind: 'change', entryId: 'e1', itemKey: 'body-vulva-bleeding', replaces: 'a' } });
      assert.deepEqual(corrections.currentCorrections([a, b]).map((e) => e.id), ['b']);
      assert.deepEqual(corrections.currentCorrections([a, { ...b, trashed: true }]).map((e) => e.id), [], 'withdrawing b never brings a back');
    });

    it('[CORR-CUR-2] replaces counts only on the same child and entry; newest first; not counted elsewhere', () => {
      const a = ev('a', 1);
      const other = ev('x', 3, { streamIds: ['corr-000000000001'], content: { kind: 'change', entryId: 'e1', itemKey: 'body-vulva-bleeding', replaces: 'a' } });
      const otherEntry = ev('y', 2, { content: { kind: 'change', entryId: 'e2', itemKey: 'body-vulva-bleeding', replaces: 'a' } });
      const elsewhere = ev('z', 4, { streamIds: ['body-vulva-bleeding'] });
      assert.deepEqual(corrections.currentCorrections([a, other, otherEntry, elsewhere]).map((e) => e.id), ['x', 'y', 'a']);
      const byEntry = corrections.correctionsByEntry([a, other, otherEntry]);
      assert.deepEqual(byEntry.get('e1').map((e) => e.id), ['x', 'a']);
      assert.deepEqual(byEntry.get('e2').map((e) => e.id), ['y']);
    });
  });

  describe('[CORR-STA] state against the live entry', () => {
    const c = (content, id = 'c1') => ({ id, content: { entryModified: 1773320000.5, ...content } });

    it('[CORR-STA-1] change', () => {
      const corr = c({ kind: 'change', corrected: { type: 'ratio/proportion', content: 0 } });
      assert.equal(corrections.correctionState(corr, entry()), 'open');
      assert.equal(corrections.correctionState(corr, { ...entry(), content: 0, modified: 1773400000 }), 'applied');
      assert.equal(corrections.correctionState(corr, { ...entry(), content: 0.25, modified: 1773400000 }), 'outdated');
      assert.equal(corrections.correctionState(corr, null), 'entry-gone');
      assert.equal(corrections.correctionState(corr, { ...entry(), trashed: true }), 'entry-gone');
      const n = c({ kind: 'change', corrected: { type: 'temperature/c', content: 36.5 } });
      assert.equal(corrections.correctionState(n, { ...entry(), type: 'temperature/c', content: 36.500000000001 }), 'applied', '12 significant digits');
      assert.equal(corrections.correctionState(corr, undefined), 'open', 'not readable: it cannot tell');
    });

    it('[CORR-STA-4] the comparator (absent equals absent), the basis, nothing to compare', () => {
      const lt = c({ kind: 'change', corrected: { type: 'temperature/c', content: 36.5, clientData: { hdsComparator: '<' } } });
      const exact = c({ kind: 'change', corrected: { type: 'temperature/c', content: 36.5 } });
      const t = { ...entry(), type: 'temperature/c', content: 36.5 };
      assert.equal(corrections.correctionState(lt, t), 'open');
      assert.equal(corrections.correctionState(lt, { ...t, clientData: { hdsComparator: '<' } }), 'applied');
      assert.equal(corrections.correctionState(exact, { ...t, clientData: { hdsComparator: '<' } }), 'open', 'an entry with < is not the exact value');
      const basis = c({ kind: 'change', corrected: { type: 'temperature/c', content: 36.5, clientData: { hdsBasis: 'manual' } } });
      assert.equal(corrections.correctionState(basis, t), 'open');
      assert.equal(corrections.correctionState(basis, { ...t, clientData: { hdsBasis: 'manual' } }), 'applied');
      assert.equal(corrections.correctionState(c({ kind: 'change', corrected: { clientData: { hdsBasis: 'manual' } } }), entry()), 'open');
    });

    it('[CORR-STA-2] a change of day only compares time and precision', () => {
      const corr = c({ kind: 'change', corrected: { time: 1773403200, clientData: { hdsTimePrecision: 'day' } } });
      assert.equal(corrections.correctionState(corr, entry()), 'open');
      assert.equal(corrections.correctionState(corr, { ...entry(), time: 1773403200 }), 'applied');
      assert.equal(corrections.correctionState(corr, { ...entry(), time: 1773403200, clientData: {} }), 'open');
    });

    it('[CORR-STA-3] remove and add', () => {
      const remove = c({ kind: 'remove' });
      assert.equal(corrections.correctionState(remove, entry()), 'open');
      assert.equal(corrections.correctionState(remove, null), 'applied');
      assert.equal(corrections.correctionState(remove, { ...entry(), trashed: true }), 'applied');
      const add = c({ kind: 'add', corrected: { type: 'ratio/proportion', content: 0 } }, 'c9');
      assert.equal(corrections.correctionState(add, null), 'open');
      assert.equal(corrections.correctionState(add, { ...entry(), clientData: { related: { c9: true } } }), 'applied');
    });
  });

  describe('[CORR-TXT] labels and markdown', () => {
    it('[CORR-TXT-1] role labels: the pack, else built in; an unknown role reads as other', () => {
      assert.equal(corrections.professionalRoleLabel('health-educator'), 'Health educator');
      assert.equal(corrections.professionalRoleLabel('midwife'), 'Midwife', 'built in when the pack lacks it');
      assert.equal(corrections.professionalRoleLabel('astrologer'), 'Other');
      setPreferredLocales(['fr']);
      assert.equal(corrections.professionalRoleLabel('physician'), 'Médecin');
    });

    it('[CORR-TXT-3] the built-in roles are the published vocabulary\'s, once it is published', () => {
      const voc = published.vocabularies?.['professional-role'];
      if (voc == null) return; // data-model 4.43.0 not published yet
      assert.deepEqual(Object.keys(voc.values), [...corrections.PROFESSIONAL_ROLES]);
      setPreferredLocales(['fr']);
      for (const role of corrections.PROFESSIONAL_ROLES) assert.equal(corrections.professionalRoleLabel(role, { vocabularies: { label: () => null } }), corrections.professionalRoleLabel(role), role);
    });

    it('[CORR-TXT-2] hdsTextFormat applies to note/txt and the correction comment only', () => {
      const md = { hdsTextFormat: 'text/markdown' };
      assert.equal(corrections.isMarkdown({ type: 'note/txt', clientData: md }), true);
      assert.equal(corrections.isMarkdown({ type: 'message/chat-cmc', clientData: md }), false);
      assert.equal(corrections.isMarkdown({ type: 'note/txt', clientData: { hdsTextFormat: 'text/html' } }), false);
      assert.equal(corrections.isMarkdown({ type: 'note/txt' }), false);
      assert.equal(corrections.formattedText({ type: 'note/txt', content: '# hi' }), '# hi');
      assert.equal(corrections.formattedText({ type: 'message/chat-cmc', content: 'x' }), null);
    });
  });
});
